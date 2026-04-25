import { createClient } from '@supabase/supabase-js'
import type { Database } from './encrypted-types'

export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and Key must be defined")
  }

  return createClient<Database>(supabaseUrl, supabaseKey)
}
