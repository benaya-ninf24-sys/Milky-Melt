import { NextRequest, NextResponse } from "next/server"
import { changePin, createInitialPin, isAuthed, pinConfigured } from "@/lib/admin-auth"

export const runtime = "nodejs"

export async function GET() {
  try {
    return NextResponse.json({ configured: await pinConfigured() })
  } catch {
    return NextResponse.json({ error: "Server belum dikonfigurasi." }, { status: 503 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const currentPin = typeof body.currentPin === "string" ? body.currentPin : ""
  const nextPin = typeof body.nextPin === "string" ? body.nextPin : ""
  try {
    await changePin(currentPin, nextPin)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mengganti PIN." }, { status: 400 })
  }
}
