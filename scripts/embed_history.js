/**
 * Embed history records and store in Supabase memories table.
 *
 * Usage: node scripts/embed_history.js [path/to/history.json]
 *
 * Reads a JSON array of { date, text } objects, generates embeddings
 * via DashScope (qwen text-embedding-v4), and stores them in Supabase.
 *
 * Requires: DASHSCOPE_API_KEY in .env.local
 *           SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

// ── Config ────────────────────────────────────────────────────────

const CONCURRENCY = 3       // Max parallel embedding requests
const MAX_RETRIES = 3        // Retry on rate-limit / transient errors
const RETRY_DELAY_MS = 2000  // Base delay between retries

// ── Load env from .env.local ──────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local")
  if (!fs.existsSync(envPath)) {
    console.error(".env.local not found at", envPath)
    process.exit(1)
  }
  const content = fs.readFileSync(envPath, "utf8")
  const env = {}
  content.split("\n").forEach((line) => {
    const m = line.match(/^([^#][^=]+)=(.*)$/m)
    if (m) {
      env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "")
    }
  })
  return env
}

const env = loadEnv()

const DASHSCOPE_API_KEY = env.DASHSCOPE_API_KEY
const DASHSCOPE_BASE_URL = env.DASHSCOPE_BASE_URL

if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === "your-dashscope-api-key") {
  console.error("Please set DASHSCOPE_API_KEY in .env.local")
  process.exit(1)
}

// ── Clients ────────────────────────────────────────────────────────

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Helpers ────────────────────────────────────────────────────────

/** Call DashScope embedding API with retry. */
async function getEmbedding(text, retries = MAX_RETRIES) {
  const url = `${DASHSCOPE_BASE_URL}/embeddings`
  const body = JSON.stringify({
    model: "text-embedding-v4",
    input: text,
  })

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        },
        body,
      })

      if (!res.ok) {
        const errText = await res.text()
        // Rate limit — wait and retry
        if (res.status === 429) {
          const wait = RETRY_DELAY_MS * Math.pow(2, attempt)
          console.warn(`  Rate limited, retrying in ${wait}ms...`)
          await sleep(wait)
          continue
        }
        throw new Error(`HTTP ${res.status}: ${errText}`)
      }

      const json = await res.json()
      return json.data[0].embedding
    } catch (err) {
      if (attempt === retries - 1) throw err
      console.warn(`  Attempt ${attempt + 1} failed: ${err.message}, retrying...`)
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt))
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Format date+text into a single content string for embedding. */
function formatContent(entry) {
  const date = entry.date || ""
  const text = entry.text || ""
  return `[${date}]\n${text}`
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2] || path.join(__dirname, "..", "history.json")

  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath)
    console.error("Usage: node scripts/embed_history.js [path/to/history.json]")
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"))
  const entries = Array.isArray(raw) ? raw : [raw]

  console.log(`Found ${entries.length} entries in ${filePath}`)
  console.log(`Using embedding API: ${DASHSCOPE_BASE_URL}`)

  let completed = 0
  let failed = 0

  // Process with concurrency limit
  async function processEntry(entry, index) {
    const content = formatContent(entry)
    const label = content.slice(0, 50).replace(/\n/g, " ")

    try {
      process.stdout.write(`[${index + 1}/${entries.length}] Embedding: "${label}..." `)
      const embedding = await getEmbedding(content)

      process.stdout.write(`→ Storing... `)
      const { error } = await supabase.from("memories").insert({
        content,
        embedding,
      })

      if (error) throw error

      console.log(`✓`)
      completed++
    } catch (err) {
      console.log(`✗ ${err.message}`)
      failed++
    }
  }

  // Simple concurrency limiter
  const queue = [...entries]
  async function worker() {
    while (queue.length > 0) {
      const entry = queue.shift()
      const index = entries.length - queue.length - 1
      await processEntry(entry, index)
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () =>
    worker()
  )
  await Promise.all(workers)

  console.log(`\nDone! ${completed} succeeded, ${failed} failed.`)
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
