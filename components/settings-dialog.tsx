"use client"

import { useRef, useState, useCallback } from "react"
import { Upload } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userAvatarUrl: string
  onUserAvatarChange: (url: string) => void
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

// ─── Component ─────────────────────────────────────────────────────

export function SettingsDialog({
  open,
  onOpenChange,
  userAvatarUrl,
  onUserAvatarChange,
}: SettingsDialogProps) {
  const avatarRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const hasAvatar = !!userAvatarUrl

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        const url = await uploadFile(file, `user-${Date.now()}`)
        onUserAvatarChange(url)
      } catch (err) {
        console.error("User avatar upload failed:", err)
      } finally {
        setUploading(false)
      }
    },
    [onUserAvatarChange]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Your profile and app information.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* ── User Avatar (top center, clickable) ── */}
          <div className="flex flex-col items-center gap-2">
            <input
              ref={avatarRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
                if (avatarRef.current) avatarRef.current.value = ""
              }}
            />
            <button
              type="button"
              className="group relative size-20 overflow-hidden rounded-full border-2 border-border hover:border-primary/50 transition-colors"
              onClick={() => avatarRef.current?.click()}
              disabled={uploading}
            >
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userAvatarUrl}
                  alt="User Avatar"
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-muted">
                  <span className="text-2xl">👤</span>
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                {uploading ? (
                  <span className="animate-spin text-white text-lg">⏳</span>
                ) : (
                  <Upload className="size-5 text-white" />
                )}
              </div>
            </button>
            <span className="text-xs text-muted-foreground">
              {hasAvatar ? "Click to change avatar" : "Click to upload avatar"}
            </span>
          </div>

          {/* ── About ── */}
          <div className="border-t pt-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Echoes Mate</p>
            <p className="mt-1">A Chatbox-like AI chat interface powered by Next.js and Supabase.</p>
            <p>Supports multiple AI providers via OpenAI-compatible API.</p>
            <div className="mt-3 text-xs">
              <p>Version 0.1.0</p>
              <p>Built with Next.js 16, Tailwind CSS, shadcn/ui</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
