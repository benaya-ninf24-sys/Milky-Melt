import { NextRequest, NextResponse } from "next/server"
import { isAuthed } from "@/lib/admin-auth"
import { supabaseAdmin } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const menuId = typeof body.menuId === "string" ? body.menuId : ""
  if (!menuId || typeof body.sold_out !== "boolean") {
    return NextResponse.json({ error: "Data stok tidak valid." }, { status: 400 })
  }
  try {
    const db = supabaseAdmin()
    const { data, error } = await db.from("menus").update({ sold_out: body.sold_out }).eq("id", menuId).select("id,name,sold_out").maybeSingle()
    if (error) return NextResponse.json({ error: "Gagal mengubah stok menu." }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Menu tidak ditemukan." }, { status: 404 })
    return NextResponse.json({ menu: data })
  } catch {
    return NextResponse.json({ error: "Konfigurasi server belum lengkap." }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const db = supabaseAdmin()
    const [orders, menus] = await Promise.all([
      db.from("orders").select("*").order("ready_date", { ascending: false }).order("created_at", { ascending: false }).limit(300),
      db.from("menus").select("id,name,sold_out,sort_order").order("sort_order")
    ])
    if (orders.error || menus.error) return NextResponse.json({ error: "Gagal membaca data dari database." }, { status: 500 })
    return NextResponse.json({ orders: orders.data, menus: menus.data })
  } catch {
    return NextResponse.json({ error: "Konfigurasi server belum lengkap. Tambahkan environment Supabase di Vercel." }, { status: 500 })
  }
}
