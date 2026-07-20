"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { MessageSquare, Menu, Settings, Loader2, PanelLeftClose, PanelLeft, X } from "lucide-react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ChatSidebar, type ConversationData } from "@/components/chat-sidebar"
import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { SettingsDialog } from "@/components/settings-dialog"
import {
  ConversationSettingsDialog,
  type ConversationSettings,
  DEFAULT_CONVERSATION_SETTINGS,
} from "@/components/conversation-settings-dialog"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { supabase } from "@/lib/supabase"
import { cn, formatRelative } from "@/lib/utils"

// ─── Helpers ────────────────────────────────────────────────────

/** Fetch all chats, newest first, including per-chat settings columns. */
async function fetchChats(): Promise<ConversationData[]> {
  const { data, error } = await supabase.from("chats").select("*").order("created_at", { ascending: false })

  if (error) {
    console.error("Failed to fetch chats:", error)
    return []
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    lastMessage: "",
    timestamp: formatRelative(c.created_at),
  }))
}

/** Fetch a single chat row with all settings. */
async function fetchChatRow(
  chatId: string
): Promise<ConversationData & ConversationSettings> {
  const { data, error } = await supabase.from("chats").select("*").eq("id", chatId).single()

  if (error || !data) {
    console.error("Failed to fetch chat row:", error)
    return {
      id: chatId,
      title: "Unknown",
      lastMessage: "",
      timestamp: "",
      ...DEFAULT_CONVERSATION_SETTINGS,
    }
  }

  return {
    id: data.id,
    title: data.title,
    lastMessage: "",
    timestamp: formatRelative(data.created_at),
    systemPrompt: data.system_prompt ?? "",
    aiAvatarUrl: data.ai_avatar_url ?? "",
    backgroundUrl: data.background_url ?? "",
    apiKey: data.api_key ?? "",
    apiUrl: data.api_url ?? "",
    model: data.model ?? "",
    ragEnabled: data.rag_enabled ?? false,
    temperature: data.temperature ?? 0.7,
    maxTokens: data.max_tokens ?? 0,
    contextWindow: data.context_window ?? 15,
  }
}

/** Fetch messages for a given chat, oldest first. */
async function fetchChatMessages(chatId: string): Promise<UIMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Failed to fetch messages:", error)
    return []
  }

  return (data ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: m.content }],
  }))
}

// ─── Component ──────────────────────────────────────────────────

export function ChatPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationData[]>([])
  const [sidebarLoading, setSidebarLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [convSettingsOpen, setConvSettingsOpen] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  // Map AI SDK errors to user-friendly messages
  function formatChatError(error: Error): string {
    const msg = error.message || ""
    if (msg.includes("NoOutputGenerated") || msg.includes("No output generated")) {
      return "服务暂不可用，请稍后重试"
    }
    if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("invalid api key")) {
      return "API Key 无效，请在对话设置中检查"
    }
    if (msg.includes("429") || msg.includes("rate") || msg.includes("Too Many Requests")) {
      return "请求太频繁，请稍等片刻再试"
    }
    if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("ECONNREFUSED")) {
      return "网络连接失败，请检查 API 地址是否可访问"
    }
    if (msg.includes("temperature") && msg.includes("deprecated")) {
      return "当前模型不支持 Temperature 参数，已在设置中忽略"
    }
    // Generic fallback — include a snippet for debugging
    const snippet = msg.length > 80 ? msg.slice(0, 80) + "…" : msg
    return `发送失败：${snippet}`
  }

  // Global user avatar (localStorage + Supabase for persistence)
  const [userAvatarUrl, setUserAvatarUrlRaw] = useLocalStorage<string>(
    "echoes-mate-user-avatar",
    ""
  )

  // Sync user avatar from Supabase on mount (so changes from other devices sync)
  useEffect(() => {
    supabase
      .from("user_settings")
      .select("value")
      .eq("key", "user_avatar_url")
      .single()
      .then(({ data, error }) => {
        if (!error && data?.value) {
          setUserAvatarUrlRaw(data.value)
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Save to Supabase whenever avatar changes
  function setUserAvatarUrl(url: string | ((prev: string) => string)) {
    setUserAvatarUrlRaw((prev) => {
      const nextUrl = typeof url === "function" ? url(prev) : url
      if (nextUrl) {
        supabase
          .from("user_settings")
          .upsert({ key: "user_avatar_url", value: nextUrl })
          .then(({ error }) => {
            if (error) console.error("Failed to save user avatar:", error)
          })
      }
      return nextUrl
    })
  }

  // Per-conversation settings (loaded from Supabase chats row)
  const [convSettings, setConvSettings] = useState<ConversationSettings>(
    DEFAULT_CONVERSATION_SETTINGS
  )

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Mutable refs so transport body reads latest values without recreating.
  const convSettingsRef = useRef<ConversationSettings>(convSettings)
  convSettingsRef.current = convSettings

  const chatIdRef = useRef<string | null>(null)
  chatIdRef.current = activeConversationId

  // Stable transport that reads dynamic values from refs at request time.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          systemPrompt: convSettingsRef.current.systemPrompt || undefined,
          chatId: chatIdRef.current,
          apiKey: convSettingsRef.current.apiKey || undefined,
          apiUrl: convSettingsRef.current.apiUrl || undefined,
          model: convSettingsRef.current.model || undefined,
          ragEnabled: convSettingsRef.current.ragEnabled,
          temperature: convSettingsRef.current.temperature,
          maxTokens: convSettingsRef.current.maxTokens || undefined,
          contextWindow: convSettingsRef.current.contextWindow,
        }),
      }),
    []
  )

  // ── useChat hook ─────────────────────────────────────────────
  const { messages, sendMessage, status, setMessages } = useChat({
    id: activeConversationId ?? undefined,
    transport,
    onError: (error) => {
      console.error("Chat error:", error)
      const friendly = formatChatError(error)
      setChatError(friendly)
      // Auto-dismiss after 5 seconds
      setTimeout(() => setChatError(null), 5000)
    },
  })

  const isStreaming = status === "streaming" || status === "submitted"

  // ── Load chats on mount ──────────────────────────────────────
  useEffect(() => {
    fetchChats().then((data) => {
      setConversations(data)
      setSidebarLoading(false)
    })
  }, [])

  // ── Load messages + settings when switching conversations ───
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      setConvSettings(DEFAULT_CONVERSATION_SETTINGS)
      return
    }

    setMessagesLoading(true)
    Promise.all([
      fetchChatMessages(activeConversationId),
      fetchChatRow(activeConversationId),
    ]).then(([msgs, chatRow]) => {
      setMessages(msgs)
      setConvSettings({
        systemPrompt: chatRow.systemPrompt ?? "",
        aiAvatarUrl: chatRow.aiAvatarUrl ?? "",
        backgroundUrl: chatRow.backgroundUrl ?? "",
        apiKey: chatRow.apiKey ?? "",
        apiUrl: chatRow.apiUrl ?? "",
        model: chatRow.model ?? "",
        ragEnabled: chatRow.ragEnabled ?? false,
        temperature: chatRow.temperature ?? 0.7,
        maxTokens: chatRow.maxTokens ?? 0,
        contextWindow: chatRow.contextWindow ?? 15,
      })
      setMessagesLoading(false)
    })
  }, [activeConversationId, setMessages])

  // ── Auto-scroll to bottom ────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Save conversation settings to Supabase ──────────────────
  const saveConversationSettings = useCallback(
    async (newSettings: ConversationSettings) => {
      setConvSettings(newSettings)
      if (!activeConversationId) return

      const { error } = await supabase
        .from("chats")
        .update({
          system_prompt: newSettings.systemPrompt || null,
          ai_avatar_url: newSettings.aiAvatarUrl || null,
          background_url: newSettings.backgroundUrl || null,
          api_key: newSettings.apiKey || null,
          api_url: newSettings.apiUrl || null,
          model: newSettings.model || null,
          rag_enabled: newSettings.ragEnabled,
          temperature: newSettings.temperature,
          max_tokens: newSettings.maxTokens || null,
          context_window: newSettings.contextWindow,
        })
        .eq("id", activeConversationId)

      if (error) console.error("Failed to save conversation settings:", error)
    },
    [activeConversationId]
  )

  // ── Handlers ─────────────────────────────────────────────────

  /** Create a new chat in Supabase, or return a local-only ID as fallback. */
  const createChat = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase
      .from("chats")
      .insert({ title: "New Chat" })
      .select()
      .single()

    if (!error && data) {
      setConversations((prev) => [
        {
          id: data.id,
          title: data.title,
          lastMessage: "",
          timestamp: formatRelative(data.created_at),
        },
        ...prev,
      ])
      return data.id
    }

    // Fallback for when Supabase is not configured
    console.error("Failed to create chat in Supabase:", error)
    const localId = `local-${Date.now()}`
    setConversations((prev) => [
      { id: localId, title: "New Chat", lastMessage: "", timestamp: "Just now" },
      ...prev,
    ])
    return localId
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isStreaming) return

    let chatId = activeConversationId
    if (!chatId) {
      const id = await createChat()
      if (!id) return
      chatId = id
      setActiveConversationId(chatId)
    }

    sendMessage({ text: trimmed })
    setInputValue("")
  }, [inputValue, isStreaming, sendMessage, activeConversationId, createChat])

  const handleNewChat = useCallback(async () => {
    // If the active chat already has no messages, don't create another blank one.
    if (activeConversationId && messages.length === 0) return

    // Check if any existing chat has no messages — switch to it instead.
    for (const conv of conversations) {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("chat_id", conv.id)
      if (count === 0) {
        setActiveConversationId(conv.id)
        return
      }
    }

    const id = await createChat()
    if (id) setActiveConversationId(id)
  }, [activeConversationId, messages.length, conversations, createChat])

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      const { error } = await supabase.from("chats").delete().eq("id", chatId)
      if (error) {
        console.error("Failed to delete chat:", error)
        return
      }

      setConversations((prev) => prev.filter((c) => c.id !== chatId))
      if (activeConversationId === chatId) {
        setActiveConversationId(null)
        setMessages([])
      }
    },
    [activeConversationId, setMessages]
  )

  const handleRenameChat = useCallback(
    async (chatId: string, title: string) => {
      // Remember old title in case we need to revert
      let oldTitle = ""
      setConversations((prev) => {
        const target = prev.find((c) => c.id === chatId)
        if (target) oldTitle = target.title
        return prev.map((c) => (c.id === chatId ? { ...c, title } : c))
      })
      // Persist to Supabase
      const { error } = await supabase
        .from("chats")
        .update({ title })
        .eq("id", chatId)
      if (error) {
        console.error("Failed to rename chat:", error)
        setConversations((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, title: oldTitle } : c))
        )
        setChatError("重命名失败，请重试")
        setTimeout(() => setChatError(null), 5000)
      }
    },
    []
  )

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Navigation Bar ── */}
      <header
        className="flex shrink-0 items-center justify-between border-b px-4 py-2"
        style={{
          paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))",
        }}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="size-4" />
            <span className="sr-only">Open sidebar</span>
          </Button>
          {/* Sidebar toggle (desktop) */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden lg:flex"
            onClick={() => setSidebarCollapsed((v) => !v)}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
            <span className="sr-only">Toggle sidebar</span>
          </Button>
          <MessageSquare className="size-5 text-primary" />
          <span className="text-sm font-semibold">Echoes Mate</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" />
            <span className="sr-only">Settings</span>
          </Button>
        </div>
      </header>

      {/* ── Body: Sidebar + Main ── */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "hidden shrink-0 border-r overflow-hidden transition-all duration-300 lg:block",
            sidebarCollapsed ? "w-0 border-r-0" : "w-72"
          )}
        >
          <ChatSidebar
            conversations={conversations}
            activeId={activeConversationId}
            loading={sidebarLoading}
            onSelect={setActiveConversationId}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
          />
        </aside>

        {/* Mobile Sidebar (Sheet) */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle>Conversations</SheetTitle>
            </SheetHeader>
            <ChatSidebar
              conversations={conversations}
              activeId={activeConversationId}
              loading={false}
              onSelect={(id) => {
                setActiveConversationId(id)
                setMobileSidebarOpen(false)
              }}
              onNewChat={() => {
                handleNewChat()
                setMobileSidebarOpen(false)
              }}
              onDeleteChat={handleDeleteChat}
              onRenameChat={handleRenameChat}
            />
          </SheetContent>
        </Sheet>

        {/* ── Main Chat Area ── */}
        <main className="relative flex flex-1 flex-col min-h-0 min-w-0">
          {/* Messages */}
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            style={
              convSettings.backgroundUrl
                ? {
                    backgroundImage: `url(${convSettings.backgroundUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    boxShadow: `inset 0 0 0 9999px rgba(255, 255, 255, 0.3)`,
                  }
                : undefined
            }
          >
            <div className="flex flex-col py-2">
              {messagesLoading && (
                <div className="flex flex-1 items-center justify-center py-32">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!messagesLoading && messages.length === 0 && (
                <div className="flex flex-1 items-center justify-center py-32">
                  <p className="text-sm text-muted-foreground">
                    No messages yet. Start a conversation!
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  aiAvatarUrl={convSettings.aiAvatarUrl || undefined}
                  userAvatarUrl={userAvatarUrl || undefined}
                />
              ))}

              {isStreaming && (
                <div className="flex gap-3 px-4 py-3">
                  {convSettings.aiAvatarUrl ? (
                    <img
                      src={convSettings.aiAvatarUrl}
                      alt="AI"
                      className="size-6 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="size-6 shrink-0 rounded-full bg-muted" />
                  )}
                  <div className="rounded-xl bg-muted px-3.5 py-2.5">
                    <span className="inline-flex gap-1 text-muted-foreground text-sm">
                      <span className="animate-bounce">●</span>
                      <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>●</span>
                      <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>●</span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Error banner */}
          {chatError && (
            <div className="mx-4 mb-1 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="flex-1">{chatError}</span>
              <button
                onClick={() => setChatError(null)}
                className="shrink-0 rounded p-0.5 hover:bg-destructive/20"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          {/* Input */}
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            onSettingsClick={() => setConvSettingsOpen(true)}
            disabled={isStreaming}
          />
        </main>
      </div>

      {/* ── Global Settings Dialog ── */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        userAvatarUrl={userAvatarUrl}
        onUserAvatarChange={setUserAvatarUrl}
      />

      {/* ── Conversation Settings Dialog ── */}
      <ConversationSettingsDialog
        open={convSettingsOpen}
        onOpenChange={setConvSettingsOpen}
        settings={convSettings}
        onSettingsChange={saveConversationSettings}
        chatId={activeConversationId}
        onClear={
          activeConversationId
            ? async () => {
                await Promise.all([
                  supabase.from("messages").delete().eq("chat_id", activeConversationId),
                  supabase.from("memories").delete().eq("chat_id", activeConversationId),
                ])
                setMessages([])
                setConvSettingsOpen(false)
              }
            : undefined
        }
      />
    </div>
  )
}
