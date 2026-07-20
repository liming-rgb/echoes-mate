import { createOpenAI } from "@ai-sdk/openai"
import {
  streamText,
  convertToModelMessages,
  toUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai"
import { createServerSupabase } from "@/lib/supabase"

export const runtime = "edge"

/** Number of most-recent messages to include in each LLM request. */
const SLIDING_WINDOW_SIZE = 15

/** Extracts plain text from a UIMessage's parts array. */
function getUIMessageText(msg: UIMessage): string {
  return msg.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text"
    )
    .map((part) => part.text)
    .join("")
}

// ── Embedding helpers ────────────────────────────────────────────

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL
const hasDashScope =
  DASHSCOPE_API_KEY && DASHSCOPE_API_KEY !== "your-dashscope-api-key"

/**
 * Generate an embedding vector for the given text via DashScope.
 * Uses the qwen3.7-text-embedding model (1024-dimensional output).
 */
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

  const json = (await res.json()) as {
    data: [{ embedding: number[] }]
  }
  return json.data[0].embedding
}

/**
 * Search Supabase memories for the top-N most similar to the query embedding.
 * Returns an array of { content, similarity } objects.
 */
async function searchMemories(
  embedding: number[],
  chatId: string,
  limit = 3
): Promise<{ content: string; similarity: number }[]> {
  const sb = createServerSupabase()

  // Diagnostic: check if table exists and has any rows
  const { count, error: countErr } = await sb
    .from("memories")
    .select("*", { count: "exact", head: true })
  console.log("=== RAG Diagnostic ===")
  console.log("memories table count:", count, countErr ? `(error: ${countErr.message})` : "")

  const { data, error } = await sb.rpc("match_memories", {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: limit,
    match_chat_id: chatId,
  })

  if (error) {
    console.error("match_memories RPC failed:", error)
    return []
  }

  console.log("match_memories results:", data?.length ?? 0, "hits")
  if (data && data.length > 0) {
    for (const row of data) {
      console.log(`  similarity=${(row as any).similarity}, content preview=${(row as any).content?.slice(0, 80)}`)
    }
  }
  console.log("=== RAG End ===")

  return (data ?? []) as { content: string; similarity: number }[]
}

// ── Route handler ─────────────────────────────────────────────────

export async function POST(req: Request) {
  const {
    messages,
    systemPrompt,
    chatId,
    apiKey,
    apiUrl,
    model,
    ragEnabled,
    temperature,
    maxTokens,
    contextWindow,
  }: {
    messages: UIMessage[]
    systemPrompt?: string
    chatId?: string
    apiKey?: string
    apiUrl?: string
    model?: string
    ragEnabled?: boolean
    temperature?: number
    maxTokens?: number
    contextWindow?: number
  } = await req.json()

  // ── 1. Save user message to Supabase (before streaming) ──────────
  const hasSupabase =
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY !== "your-service-role-key"

  if (chatId && hasSupabase) {
    const lastUserMsg = messages.filter((m) => m.role === "user").at(-1)
    if (lastUserMsg) {
      const content = getUIMessageText(lastUserMsg)
      if (content) {
        try {
          const sb = createServerSupabase()

          await sb.from("messages").insert({
            chat_id: chatId,
            role: "user",
            content,
          })

          const { count } = await sb
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("chat_id", chatId)

          if (count === 1) {
            const title =
              content.length > 40 ? content.slice(0, 40) + "..." : content
            await sb.from("chats").update({ title }).eq("id", chatId)
          }
        } catch (err) {
          console.error("Supabase user-message save failed:", err)
        }
      }
    }
  }

  // ── 2. RAG: Retrieve relevant memories ─────────────────────────
  let memoriesContext = ""

  console.log("=== RAG status ===")
  console.log("ragEnabled:", ragEnabled)
  console.log("hasDashScope:", hasDashScope)
  console.log("hasSupabase:", hasSupabase)

  if (ragEnabled && hasDashScope && hasSupabase) {
    console.log("=== RAG: enabled, fetching embedding & searching ===")
    const lastUserMsg = messages.filter((m) => m.role === "user").at(-1)
    if (lastUserMsg) {
      const userText = getUIMessageText(lastUserMsg)
      if (userText) {
        try {
          const embedding = await getEmbedding(userText)
          const memories = chatId ? await searchMemories(embedding, chatId, 3) : []

          if (memories.length > 0) {
            const memoryBlocks = memories
              .map((m) => `[${m.content}]`)
              .join("\n")

            memoriesContext = [
              "<past_memories>",
              memoryBlocks,
              "</past_memories>",
              "",
              "<memory_instructions>",
              "1. The <past_memories> above are real fragments from your past conversations with the user.",
              "2. Only reference a memory when the user's latest message is clearly related — never force it.",
              "3. When you do reference a memory, do it naturally like a human recalling the past. Never use phrases like \"according to the memories\", \"I retrieved\", \"in my records\", or any mechanical wording.",
              "4. If a memory includes your own replies from that time, continue using the same speaking style, tone, and catchphrases you had back then.",
              "5. IMPORTANT: The memory texts may contain bracket codes like [愉快], [裂开], [动画表情] or parenthetical action descriptions like （轻笑）（叹气）— these are WeChat chat-log artifacts, NOT something you should reproduce. Never output [xxx] or （xxx）style expressions. Express emotions through words, natural language, or standard Unicode emojis (like 😊, 😭, 😡) instead.",
              "6. Pay attention to the timestamps in the memories. If a memory is from months or years ago, treat it as a distant memory and reference the time naturally (e.g., \"Wow, I remember that! That was back in October 2024 wasn't it?\"). If it's recent, respond with immediacy.",
              "</memory_instructions>",
            ].join("\n")
          }
        } catch (err) {
          // RAG failure should not block the chat — fall through.
          console.error("RAG retrieval failed:", err)
        }
      }
    }
  }

  // ── 3. Sliding window: last N model messages ───────────────────
  const modelMessages = await convertToModelMessages(messages)
  const windowSize = contextWindow && contextWindow > 0 ? contextWindow : SLIDING_WINDOW_SIZE
  const toSend = modelMessages.slice(-windowSize)

  // ── 4. Build instructions (system prompt → memories) ──────────
  const instructions = [systemPrompt, memoriesContext]
    .filter(Boolean)
    .join("\n\n") || undefined

  console.log("=== DEBUG: Instructions ===")
  console.log(instructions || "(none)")
  console.log("=== DEBUG: Messages ===")
  console.log(JSON.stringify(toSend, null, 2))
  console.log("=== DEBUG: Total messages sent:", toSend.length, "===")

  // ── 5. LLM call with per-conversation overrides ────────────────
  const openai = createOpenAI({
    baseURL: apiUrl || process.env.OPENAI_BASE_URL,
    apiKey: apiKey || process.env.OPENAI_API_KEY,
  })

  const modelName = model || process.env.OPENAI_MODEL || "claude-sonnet-5"
  const llmModel = openai.chat(modelName)

  // Claude models don't support temperature parameter
  const isClaudeModel = modelName.toLowerCase().includes("claude")
  const effectiveTemperature = isClaudeModel ? undefined : (temperature ?? 0.7)

  const sb = createServerSupabase()

  console.log("=== DEBUG: Calling LLM ===")
  console.log("model:", modelName)
  console.log("baseURL:", apiUrl || process.env.OPENAI_BASE_URL)
  console.log("temperature:", effectiveTemperature ?? "not sent (Claude)")
  console.log("maxOutputTokens:", maxTokens && maxTokens > 0 ? maxTokens : "unlimited")

  const result = streamText({
    model: llmModel,
    messages: toSend,
    instructions,
    temperature: effectiveTemperature,
    maxOutputTokens: maxTokens && maxTokens > 0 ? maxTokens : undefined,
    onError: ({ error }) => {
      console.error("=== LLM stream error ===", error)
    },
    onEnd: async ({ text }) => {
      if (chatId && text && hasSupabase) {
        try {
          await sb.from("messages").insert({
            chat_id: chatId,
            role: "assistant",
            content: text,
          })
        } catch (err) {
          console.error("Supabase AI message save failed:", err)
        }
      }
    },
  })

  const uiStream = toUIMessageStream({
    stream: result.stream,
  })

  return createUIMessageStreamResponse({
    stream: uiStream,
  })
}
