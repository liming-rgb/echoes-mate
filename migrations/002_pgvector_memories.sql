-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Memories table for RAG long-term memory
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding vector(1024),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_memories_embedding
  ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Cosine similarity search function
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1024),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    memories.id,
    memories.content,
    1 - (memories.embedding <=> query_embedding) AS similarity
  FROM memories
  WHERE memories.embedding IS NOT NULL
    AND 1 - (memories.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Allow public access (no auth for now)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_memories" ON memories FOR ALL USING (true) WITH CHECK (true);
