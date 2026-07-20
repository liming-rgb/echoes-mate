"use client"

import { useRef, useCallback, type KeyboardEvent } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Send, SlidersHorizontal } from "lucide-react"

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onSettingsClick?: () => void
  disabled?: boolean
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onSettingsClick,
  disabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter without Shift → send
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (value.trim() && !disabled) {
          onSend()
        }
      }
      // Shift+Enter → newline (default browser behavior, do nothing)
    },
    [value, disabled, onSend]
  )

  return (
    <div
      className="shrink-0 border-t bg-background px-3 pt-2 sm:px-4 sm:pt-3"
      style={{
        paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        data-short-hint="Enter to send"
className="min-h-10 max-h-40 resize-none text-[16px] sm:text-sm"
        rows={1}
        disabled={disabled}
      />

      {/* Bottom bar: settings (left) + send (right) */}
      <div className="flex items-center justify-between mt-1.5">
        {onSettingsClick ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onSettingsClick}
            title="Conversation settings"
          >
            <SlidersHorizontal className="size-4" />
            <span className="sr-only">Conversation settings</span>
          </Button>
        ) : (
          <span /> // Spacer to keep send button on the right
        )}

        <Button
          size="icon"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="shrink-0 size-10 sm:size-8"
        >
          <Send className="size-4" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  )
}
