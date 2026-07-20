import { createServerSupabase } from "@/lib/supabase"

export const runtime = "edge"

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL

interface HistoryEntry {
  date: string
  text: string
}

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${DASHSCOPE_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "qwen3.7-text-embedding",
      input: text,
      dimensions: 1024,
    }),
  })

  if (!res.ok) {
    throw new Error(`Embedding API error: ${res.status}`)
  }

  const json = (await res.json()) as { data: [{ embedding: number[] }] }
  return json.data[0].embedding
}

export async function POST(req: Request) {
  if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === "your-dashscope-api-key") {
    return Response.json(
      { error: "DashScope API key not configured" },
      { status: 500 }
    )
  }

  let entries: HistoryEntry[]
  let chatId: string | null = null
  try {
    const body = await req.json()
    // Support both { chatId, entries } and plain array
    if (Array.isArray(body)) {
      entries = body
    } else if (body && Array.isArray(body.entries)) {
      entries = body.entries
      chatId = body.chatId || null
    } else {
      return Response.json({ error: "Invalid or empty array" }, { status: 400 })
    }
    if (entries.length === 0) {
      return Response.json({ error: "Invalid or empty array" }, { status: 400 })
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const sb = createServerSupabase()
  let succeeded = 0
  let failed = 0

  // Build a set of existing contents for this chat to skip duplicates
  let existingContents = new Set<string>()
  if (chatId) {
    const { data: existing } = await sb
      .from("memories")
      .select("content")
      .eq("chat_id", chatId)
    if (existing) {
      for (const row of existing) {
        existingContents.add((row as any).content)
      }
    }
  }

  // Process sequentially to avoid rate limits
  let skipped = 0
  for (const entry of entries) {
    const content = `[${entry.date || ""}]\n${entry.text || ""}`
    if (existingContents.has(content)) {
      skipped++
      continue
    }
    try {
      const embedding = await getEmbedding(content)
      const { error } = await sb.from("memories").insert({
        content,
        embedding,
        chat_id: chatId || null,
      })
      if (error) throw error
      succeeded++
      existingContents.add(content)
    } catch (err) {
      console.error("Memory upload failed:", err)
      failed++
    }
  }

  return Response.json({ succeeded, failed, skipped, total: entries.length })
}
