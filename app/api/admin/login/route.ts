import { NextRequest, NextResponse } from "next/server"
import { ADMIN_COOKIE, createInitialPin, createSessionToken, pinConfigured, pinMatches, sessionCookie } from "@/lib/admin-auth"

export const runtime = "nodejs"

// Pembatas percobaan sederhana (per instance server; best-effort di serverless).
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 10 * 60 * 1000

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const now = Date.now()
  const entry = attempts.get(ip)
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const pin = typeof body.pin === "string" ? body.pin : ""

  let ok = false
  try {
    const configured = await pinConfigured()
    if (!configured) {
      await createInitialPin(pin)
      ok = true
    } else {
      ok = await pinMatches(pin)
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Server belum dikonfigurasi." }, { status: 400 })
  }

  if (!ok) {
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS }
    current.count += 1
    attempts.set(ip, current)
    await new Promise((r) => setTimeout(r, 500))
    return NextResponse.json({ error: "PIN salah." }, { status: 401 })
  }

  attempts.delete(ip)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, createSessionToken(), sessionCookie)
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, "", { ...sessionCookie, maxAge: 0 })
  return res
}
