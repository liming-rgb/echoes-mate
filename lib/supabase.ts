import { createClient } from "@supabase/supabase-js"

// Browser-safe client (uses anon key, exposed to client components)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Creates a server-side Supabase client using the service_role key.
 * Use this only in API routes / server components — never export to client code.
 */
export function createServerSupabase() {
  return createClient(
    process.env.SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
