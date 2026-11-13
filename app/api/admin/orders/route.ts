import { NextRequest, NextResponse } from "next/server"
import { isAuthed } from "@/lib/admin-auth"
import { supabaseAdmin } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = supabaseAdmin()
  const [orders, menus] = await Promise.all([
    db.from("orders").select("*").order("ready_date", { ascending: false }).order("created_at", { ascending: false }).limit(300),
    db.from("menus").select("id,name,sold_out,sort_order").order("sort_order")
  ])
  if (orders.error || menus.error) return NextResponse.json({ error: "Gagal membaca data." }, { status: 500 })
  return NextResponse.json({ orders: orders.data, menus: menus.data })
}
