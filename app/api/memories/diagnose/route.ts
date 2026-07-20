import { createServerSupabase } from "@/lib/supabase"

export const runtime = "edge"

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL

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
    const body = await res.text()
    throw new Error(`Embedding API error: ${res.status} — ${body}`)
  }

  const json = (await res.json()) as { data: [{ embedding: number[] }] }
  return json.data[0].embedding
}

export async function GET(req: Request) {
  const sb = createServerSupabase()
  const results: Record<string, unknown> = {}

  // 1. Table check
  const { count, error: tableErr } = await sb
    .from("memories")
    .select("*", { count: "exact", head: true })

  results.tableExists = !tableErr
  results.tableError = tableErr ? tableErr.message : null
  results.rowCount = count ?? 0

  // 1.5 Sample one row to check embedding format
  const { data: sample } = await sb
    .from("memories")
    .select("content, embedding")
    .limit(1)
    .single()

  if (sample) {
    results.sampleContent = (sample as any).content?.slice(0, 100)
    const emb = (sample as any).embedding
    if (Array.isArray(emb)) {
      results.embeddingIsArray = true
      results.embeddingLength = emb.length
      results.embeddingFirst5 = emb.slice(0, 5)
      results.embeddingAllZeros = emb.every((v: number) => v === 0)
    } else if (typeof emb === "string") {
      results.embeddingIsString = true
      results.embeddingStringPreview = emb.slice(0, 80)
    } else {
      results.embeddingType = typeof emb
    }
  }

  // 2. Embedding check
  const { searchParams } = new URL(req.url)
  const query = searchParams.get("q") || "椰子鸡"

  try {
    const embedding = await getEmbedding(query)
    results.embeddingDim = embedding.length
    results.embeddingSample = embedding.slice(0, 5)
  } catch (err: any) {
    results.embeddingError = err.message
    return Response.json(results)
  }

  // 3. Search with real embedding
  const { data, error: rpcErr } = await sb.rpc("match_memories", {
    query_embedding: await getEmbedding(query),
    match_threshold: 0.0,
    match_count: 5,
  })

  results.rpcExists = !rpcErr
  results.rpcError = rpcErr ? rpcErr.message : null
  results.hits = (data ?? []).map((r: any) => ({
    similarity: r.similarity,
    preview: r.content?.slice(0, 100),
  }))

  return Response.json(results)
}
