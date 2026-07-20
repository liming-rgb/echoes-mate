"use client"

import type { UIMessage } from "ai"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Bot, User } from "lucide-react"

interface ChatMessageProps {
  message: UIMessage
  aiAvatarUrl?: string
  userAvatarUrl?: string
}

/**
 * Extracts plain text from a UIMessage's parts array.
 * Filters for text parts and joins them together.
 */
export function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
}

export function ChatMessage({
  message,
  aiAvatarUrl,
  userAvatarUrl,
}: ChatMessageProps) {
  const isUser = message.role === "user"
  const text = getMessageText(message)

  // Skip rendering if there's no text (e.g., empty messages or tool-call-only messages)
  if (!text) return null

  return (
    <div
      className={cn(
        "flex gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <Avatar size="sm" className="shrink-0 mt-0.5">
        {isUser ? (
          <>
            <AvatarImage src={userAvatarUrl} alt="User" />
            <AvatarFallback className="bg-primary/10">
              <User className="size-3" />
            </AvatarFallback>
          </>
        ) : (
          <>
            <AvatarImage src={aiAvatarUrl} alt="AI" />
            <AvatarFallback className="bg-primary/10">
              <Bot className="size-3" />
            </AvatarFallback>
          </>
        )}
      </Avatar>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[85%] sm:max-w-[75%] rounded-xl px-3 py-2 sm:px-3.5 sm:py-2.5 text-[15px] sm:text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  )
}
