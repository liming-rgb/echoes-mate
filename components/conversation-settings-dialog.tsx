"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { Upload, FileUp, CheckCircle, AlertCircle, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────

export interface ConversationSettings {
  systemPrompt: string
  aiAvatarUrl: string
  backgroundUrl: string
  apiKey: string
  apiUrl: string
  model: string
  ragEnabled: boolean
  temperature: number
  maxTokens: number
  contextWindow: number
}

export const DEFAULT_CONVERSATION_SETTINGS: ConversationSettings = {
  systemPrompt: "",
  aiAvatarUrl: "",
  backgroundUrl: "",
  apiKey: "",
  apiUrl: "",
  model: "",
  ragEnabled: false,
  temperature: 0.7,
  maxTokens: 0,
  contextWindow: 15,
}

// ─── Props ─────────────────────────────────────────────────────────

interface ConversationSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: ConversationSettings
  onSettingsChange: (settings: ConversationSettings) => void
  onClear?: () => void
  chatId?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────

const STORAGE_BUCKET = "chat-assets"

async function uploadFile(file: File, filename: string): Promise<string> {
  const ext = file.name.split(".").pop() || "png"
  const path = `avatars/${filename}-${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true })

  if (error) {
    if (error.message.includes("not found") || error.message.includes("bucket")) {
      await supabase.storage.createBucket(STORAGE_BUCKET, { public: true })
      await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true })
    } else {
      throw error
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  return `${baseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`
}

// ─── Clear History Button (with confirmation) ─────────────────────

function ClearHistoryButton({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <div className="border-t pt-4">
        <Button
          variant="destructive"
          size="sm"
          className="w-full gap-2"
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" />
          Clear Chat History
        </Button>
      </div>
    )
  }

  return (
    <div className="border-t pt-4">
      <p className="text-sm font-medium text-destructive">Clear all messages?</p>
      <p className="text-xs text-muted-foreground mt-1 mb-3">
        This will permanently delete all chat history. The conversation itself will be kept.
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          className="flex-1"
          onClick={onClear}
        >
          Yes, clear
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ─── Component ─────────────────────────────────────────────────────

export function ConversationSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  onClear,
  chatId,
}: ConversationSettingsDialogProps) {
  const aiAvatarRef = useRef<HTMLInputElement>(null)
  const bgRef = useRef<HTMLInputElement>(null)
  const [uploadingAi, setUploadingAi] = useState(false)
  const [uploadingBg, setUploadingBg] = useState(false)
  const [uploadingHistory, setUploadingHistory] = useState(false)
  const [clearingMemories, setClearingMemories] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    succeeded: number; failed: number; skipped?: number; total: number
  } | null>(null)
  const [memoryCount, setMemoryCount] = useState<number | null>(null)
  const [memoryCountLoading, setMemoryCountLoading] = useState(false)
  const historyRef = useRef<HTMLInputElement>(null)

  // Fetch existing memory count when dialog opens
  useEffect(() => {
    if (!open || !chatId) {
      setMemoryCount(null)
      return
    }
    setMemoryCountLoading(true)
    ;(async () => {
      try {
        const { count, error } = await supabase
          .from("memories")
          .select("id", { count: "exact", head: true })
          .eq("chat_id", chatId)
        if (!error) setMemoryCount(count ?? 0)
      } finally {
        setMemoryCountLoading(false)
      }
    })()
  }, [open, chatId])

  // Refresh count after upload or clear
  function refreshMemoryCount() {
    if (!chatId) return
    supabase
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId)
      .then(({ count, error }) => {
        if (!error) setMemoryCount(count ?? 0)
      })
  }

  // Ref to always access latest settings inside async callbacks.
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  function updateField(field: keyof ConversationSettings, value: string) {
    onSettingsChange({ ...settings, [field]: value })
  }

  const handleAiUpload = useCallback(
    async (file: File) => {
      setUploadingAi(true)
      try {
        const url = await uploadFile(file, `ai-${Date.now()}`)
        onSettingsChange({ ...settingsRef.current, aiAvatarUrl: url })
      } catch (err) {
        console.error("AI avatar upload failed:", err)
      } finally {
        setUploadingAi(false)
      }
    },
    [onSettingsChange]
  )

  const handleBackgroundUpload = useCallback(
    async (file: File) => {
      setUploadingBg(true)
      try {
        const url = await uploadFile(file, `bg-${Date.now()}`)
        onSettingsChange({ ...settingsRef.current, backgroundUrl: url })
      } catch (err) {
        console.error("Background upload failed:", err)
      } finally {
        setUploadingBg(false)
      }
    },
    [onSettingsChange]
  )

  const handleHistoryUpload = useCallback(
    async (file: File) => {
      setUploadingHistory(true)
      setUploadResult(null)
      try {
        // Warn if memories already exist for this chat
        if (memoryCount && memoryCount > 0) {
          const confirmed = window.confirm(
            `This conversation already has ${memoryCount} memories. Uploading will add more entries. Clear existing memories first if you want a fresh start. Continue?`
          )
          if (!confirmed) {
            setUploadingHistory(false)
            return
          }
        }

        const text = await file.text()
        const entries = JSON.parse(text)
        const res = await fetch("/api/memories/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: Array.isArray(entries) ? entries : [entries],
            chatId: chatId || null,
          }),
        })
        const result = await res.json()
        setUploadResult(result)
        refreshMemoryCount()
      } catch (err) {
        console.error("History upload failed:", err)
        setUploadResult({ succeeded: 0, failed: 0, total: 0 })
      } finally {
        setUploadingHistory(false)
      }
    },
    [chatId]
  )

  const handleClearMemories = useCallback(async () => {
    if (!chatId) return
    setClearingMemories(true)
    try {
      const { error, count } = await supabase
        .from("memories")
        .delete({ count: "exact" })
        .eq("chat_id", chatId)
      if (!error) {
        setUploadResult({ succeeded: count ?? 0, failed: 0, total: count ?? 0 })
        refreshMemoryCount()
      }
    } catch (err) {
      console.error("Clear memories failed:", err)
    } finally {
      setClearingMemories(false)
    }
  }, [chatId])

  const hasAiAvatar = !!settings.aiAvatarUrl

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conversation Settings</DialogTitle>
          <DialogDescription>
            Customize this conversation&apos;s AI model, prompts, and appearance.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* ── AI Avatar (top center, clickable) ── */}
          <div className="flex flex-col items-center gap-2">
            <input
              ref={aiAvatarRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleAiUpload(file)
                if (aiAvatarRef.current) aiAvatarRef.current.value = ""
              }}
            />
            <button
              type="button"
              className="group relative size-20 overflow-hidden rounded-full border-2 border-border hover:border-primary/50 transition-colors"
              onClick={() => aiAvatarRef.current?.click()}
              disabled={uploadingAi}
            >
              {settings.aiAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.aiAvatarUrl}
                  alt="AI Avatar"
                  className="size-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none"
                  }}
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-muted">
                  <span className="text-2xl">🤖</span>
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                {uploadingAi ? (
                  <span className="animate-spin text-white text-lg">⏳</span>
                ) : (
                  <Upload className="size-5 text-white" />
                )}
              </div>
            </button>
            <span className="text-xs text-muted-foreground">
              {hasAiAvatar ? "Click to change AI avatar" : "Click to upload AI avatar"}
            </span>
          </div>

          {/* ── System Prompt ── */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convSystemPrompt">System Prompt</Label>
            <Textarea
              id="convSystemPrompt"
              placeholder="You are a helpful assistant..."
              className="min-h-20 resize-y"
              value={settings.systemPrompt}
              onChange={(e) => updateField("systemPrompt", e.target.value)}
            />
          </div>

          {/* ── Background Image ── */}
          <div className="flex flex-col gap-1.5">
            <Label>Background Image</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Background URL or click upload"
                value={settings.backgroundUrl}
                onChange={(e) => updateField("backgroundUrl", e.target.value)}
                className="flex-1"
              />
              <input
                ref={bgRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleBackgroundUpload(file)
                  if (bgRef.current) bgRef.current.value = ""
                }}
              />
              <Button
                variant="outline"
                size="icon"
                disabled={uploadingBg}
                onClick={() => bgRef.current?.click()}
                title="Upload background"
              >
                {uploadingBg ? (
                  <span className="animate-spin text-xs">⏳</span>
                ) : (
                  <Upload className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {/* ── RAG Memory ── */}
          <div className="flex flex-col gap-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="ragToggle" className="cursor-pointer">
                  Memory Retrieval (RAG)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Search past conversation history for relevant context.
                </p>
              </div>
              <Switch
                id="ragToggle"
                checked={settings.ragEnabled}
                onCheckedChange={(v) => {
                  onSettingsChange({ ...settings, ragEnabled: v })
                }}
              />
            </div>

            {/* Upload area — always visible */}
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
                <p className="text-sm font-medium">Upload Conversation History</p>
                <p className="text-xs text-muted-foreground">
                  Upload a history.json file with past conversations to enable memory retrieval.
                </p>

                {/* Persistent memory count */}
                {chatId && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Stored memories:</span>
                    {memoryCountLoading ? (
                      <span className="animate-spin">⏳</span>
                    ) : (
                      <span className="font-medium tabular-nums">
                        {memoryCount ?? "—"}
                      </span>
                    )}
                  </div>
                )}

                <input
                  ref={historyRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleHistoryUpload(file)
                    if (historyRef.current) historyRef.current.value = ""
                  }}
                />

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingHistory}
                    onClick={() => historyRef.current?.click()}
                    className="gap-2 flex-1"
                  >
                    {uploadingHistory ? (
                      <span className="animate-spin text-xs">⏳</span>
                    ) : (
                      <FileUp className="size-4" />
                    )}
                    {uploadingHistory ? "Uploading..." : "Upload history.json"}
                  </Button>
                  {chatId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={clearingMemories}
                      onClick={handleClearMemories}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      {clearingMemories ? (
                        <span className="animate-spin text-xs">⏳</span>
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  )}
                </div>
                {uploadResult && (
                  <div className={[
                    "flex items-center gap-2 text-xs rounded-md px-3 py-2",
                    uploadResult.failed === 0
                      ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                  ].join(" ")}>
                    {uploadResult.failed === 0 ? (
                      <CheckCircle className="size-3.5" />
                    ) : (
                      <AlertCircle className="size-3.5" />
                    )}
                    {uploadResult.succeeded} new
                    {uploadResult.skipped ? `, ${uploadResult.skipped} skipped (duplicate)` : ""}
                    {uploadResult.failed > 0 && `, ${uploadResult.failed} failed`}
                    {" "}of {uploadResult.total} entries
                  </div>
                )}
              </div>
          </div>

          {/* ── API Configuration ── */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convApiKey">API Key</Label>
            <Input
              id="convApiKey"
              type="password"
              placeholder="Override API key (from .env by default)"
              value={settings.apiKey}
              onChange={(e) => updateField("apiKey", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convApiUrl">API URL</Label>
            <Input
              id="convApiUrl"
              placeholder="Override API base URL"
              value={settings.apiUrl}
              onChange={(e) => updateField("apiUrl", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convModel">Model</Label>
            <Input
              id="convModel"
              placeholder="deepseek-v4-flash"
              value={settings.model}
              onChange={(e) => updateField("model", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the default from .env.
            </p>
          </div>

          {/* ── Model Parameters ── */}
          <div className="flex flex-col gap-4 border-t pt-4">
            <p className="text-sm font-medium">Model Parameters</p>

            {/* Temperature */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="convTemperature" className="text-xs">
                  Temperature
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {settings.temperature.toFixed(1)}
                </span>
              </div>
              <input
                id="convTemperature"
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(e) =>
                  onSettingsChange({ ...settings, temperature: parseFloat(e.target.value) })
                }
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            {/* Context Window */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="convContext" className="text-xs">
                  Context Window
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {settings.contextWindow} messages
                </span>
              </div>
              <input
                id="convContext"
                type="range"
                min="4"
                max="40"
                step="1"
                value={settings.contextWindow}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    contextWindow: parseInt(e.target.value, 10),
                  })
                }
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Shorter memory</span>
                <span>Longer memory</span>
              </div>
            </div>

            {/* Max Output Tokens */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="convMaxTokens" className="text-xs">
                Max Output Tokens
              </Label>
              <Input
                id="convMaxTokens"
                type="number"
                placeholder="Unlimited"
                min={0}
                max={16384}
                step={256}
                value={settings.maxTokens || ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  onSettingsChange({
                    ...settings,
                    maxTokens: isNaN(v) ? 0 : Math.max(0, v),
                  })
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                0 = unlimited. Limits the length of each AI response.
              </p>
            </div>
          </div>

          {/* ── Clear Chat History ── */}
          {onClear && (
            <ClearHistoryButton onClear={onClear} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
