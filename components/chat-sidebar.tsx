"use client"

import { useState, useRef, useEffect } from "react"
import { MessageSquare, Plus, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface ConversationData {
  id: string
  title: string
  lastMessage: string
  timestamp: string
}

interface ChatSidebarProps {
  conversations: ConversationData[]
  activeId: string | null
  loading?: boolean
  onSelect: (id: string) => void
  onNewChat?: () => void
  onDeleteChat?: (id: string) => void
  onRenameChat?: (id: string, title: string) => void
}

export function ChatSidebar({
  conversations,
  activeId,
  loading = false,
  onSelect,
  onNewChat,
  onDeleteChat,
  onRenameChat,
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  // Focus the input when editing starts
  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }
  }, [editingId])

  function startEdit(id: string, title: string) {
    setEditingId(id)
    setEditTitle(title)
  }

  function commitEdit() {
    if (editingId && editTitle.trim() && onRenameChat) {
      onRenameChat(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* New Chat Button */}
      <div className="shrink-0 border-b px-3 py-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onNewChat}
        >
          <Plus className="size-4" />
          New Chat
        </Button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-12">
            <p className="text-sm text-muted-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground/60">
              Start a new chat to begin
            </p>
          </div>
        )}

        {!loading &&
          conversations.map((conv) => {
            const isEditing = editingId === conv.id

            return (
              <div key={conv.id} className="group relative">
                <button
                  onClick={() => {
                    if (!isEditing) onSelect(conv.id)
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    activeId === conv.id && "bg-muted"
                  )}
                >
                  <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <Input
                        ref={editInputRef}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit()
                          if (e.key === "Escape") cancelEdit()
                          e.stopPropagation()
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 px-1 py-0 text-sm font-medium"
                      />
                    ) : (
                      <div
                        className="truncate text-sm font-medium"
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          startEdit(conv.id, conv.title)
                        }}
                        title="Double-click to rename"
                      >
                        {conv.title}
                      </div>
                    )}
                    <div className="truncate text-xs text-muted-foreground">
                      {conv.lastMessage}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground/60">
                      {conv.timestamp}
                    </div>
                  </div>
                </button>

                {/* Delete button */}
                {onDeleteChat && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteChat(conv.id)
                    }}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 rounded p-1",
                      "opacity-0 group-hover:opacity-100 transition-opacity",
                      "text-muted-foreground hover:text-destructive hover:bg-muted"
                    )}
                    aria-label={`Delete ${conv.title}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
