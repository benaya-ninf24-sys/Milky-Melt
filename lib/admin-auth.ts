import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"

export const ADMIN_COOKIE = "mm_admin"
const TTL_SECONDS = 12 * 60 * 60
const SETTINGS_ID = "admin"

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET
  if (!s || s.length < 16) throw new Error("ADMIN_SESSION_SECRET belum diisi (minimal 16 karakter).")
  return s
}

const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("hex")

const safeEqual = (a: string, b: string) => {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

function validatePin(pin: string) {
  if (!/^\d{6,12}$/.test(pin)) throw new Error("PIN harus terdiri dari 6–12 angka.")
}

function hashPin(pin: string, salt: string) {
  return scryptSync(pin, salt, 64).toString("hex")
}

export async function pinConfigured() {
  const db = supabaseAdmin()
  const { data, error } = await db.from("admin_settings").select("pin_hash").eq("id", SETTINGS_ID).maybeSingle()
  if (error) throw new Error("Gagal membaca konfigurasi PIN.")
  return Boolean(data?.pin_hash)
}

export async function pinMatches(input: string) {
  const db = supabaseAdmin()
  const { data, error } = await db.from("admin_settings").select("pin_hash,pin_salt").eq("id", SETTINGS_ID).maybeSingle()
  if (error) throw new Error("Gagal membaca konfigurasi PIN.")
  if (!data?.pin_hash || !data.pin_salt) return false
  return safeEqual(hashPin(input, data.pin_salt), data.pin_hash)
}

export async function createInitialPin(pin: string) {
  validatePin(pin)
  const db = supabaseAdmin()
  const salt = randomBytes(16).toString("hex")
  const { error } = await db.from("admin_settings").insert({ id: SETTINGS_ID, pin_hash: hashPin(pin, salt), pin_salt: salt })
  if (error?.code === "23505") throw new Error("PIN sudah dibuat. Silakan masuk dengan PIN tersebut.")
  if (error) throw new Error("Gagal menyimpan PIN awal.")
}

export async function changePin(currentPin: string, nextPin: string) {
  validatePin(nextPin)
  if (!(await pinMatches(currentPin))) throw new Error("PIN lama salah.")
  const salt = randomBytes(16).toString("hex")
  const db = supabaseAdmin()
  const { error } = await db.from("admin_settings").update({ pin_hash: hashPin(nextPin, salt), pin_salt: salt, updated_at: new Date().toISOString() }).eq("id", SETTINGS_ID)
  if (error) throw new Error("Gagal mengganti PIN.")
}

export function createSessionToken() {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
  return `${exp}.${sign(String(exp))}`
}

export const sessionCookie = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TTL_SECONDS
}

export function isAuthed(request: NextRequest) {
  try {
    const token = request.cookies.get(ADMIN_COOKIE)?.value
    if (!token) return false
    const [exp, sig] = token.split(".")
    if (!exp || !sig || Number(exp) < Date.now() / 1000) return false
    return safeEqual(sig, sign(exp))
  } catch {
    return false
  }
}
