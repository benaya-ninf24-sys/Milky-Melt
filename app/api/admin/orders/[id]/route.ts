import { NextRequest, NextResponse } from "next/server"
import { isAuthed } from "@/lib/admin-auth"
import { supabaseAdmin } from "@/lib/supabase"
import type { OrderStatus } from "@/lib/admin-types"

export const runtime = "nodejs"

type Action = "confirm_payment" | "advance" | "back"

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const action = body.action as Action
  if (!["confirm_payment", "advance", "back"].includes(action)) {
    return NextResponse.json({ error: "Aksi pesanan tidak valid." }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: order, error: readError } = await db
    .from("orders")
    .select("id,status,payment_confirmed")
    .eq("id", context.params.id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: "Gagal membaca pesanan." }, { status: 500 })
  if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 })

  const current = order.status as OrderStatus
  let status: OrderStatus = current
  let paymentConfirmed = Boolean(order.payment_confirmed)

  if (action === "confirm_payment") {
    if (current !== "menunggu_konfirmasi") {
      return NextResponse.json({ error: "Pembayaran pesanan ini sudah diproses." }, { status: 409 })
    }
    status = "diproses"
    paymentConfirmed = true
  } else if (action === "advance") {
    if (current === "diproses") status = "siap"
    else if (current === "siap") status = "selesai"
    else return NextResponse.json({ error: "Pesanan belum bisa dilanjutkan." }, { status: 409 })
  } else {
    if (current === "selesai") status = "siap"
    else if (current === "siap") status = "diproses"
    else if (current === "diproses") {
      status = "menunggu_konfirmasi"
      paymentConfirmed = false
    } else return NextResponse.json({ error: "Pesanan belum bisa dikembalikan." }, { status: 409 })
  }

  const { error: updateError } = await db
    .from("orders")
    .update({ status, payment_confirmed: paymentConfirmed })
    .eq("id", context.params.id)

  if (updateError) return NextResponse.json({ error: "Gagal memperbarui pesanan." }, { status: 500 })
  return NextResponse.json({ ok: true, status, paymentConfirmed })
}
