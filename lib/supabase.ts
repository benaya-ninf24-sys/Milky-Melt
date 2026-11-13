import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Client browser: hanya anon key, hanya bisa membaca menu (lihat RLS).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const validUrl = Boolean(url && /^https?:\/\//.test(url))

export const supabase: SupabaseClient | null = validUrl && anonKey ? createClient(url as string, anonKey) : null

// Client server: service role. JANGAN diimpor dari komponen "use client".
export function supabaseAdmin() {
  if (!validUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Environment Supabase server belum dikonfigurasi. Tambahkan NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Vercel.")
  return createClient(url as string, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
