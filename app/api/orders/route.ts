import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { addOns, getReadyDate, toISODate } from "@/lib/shop"

export const runtime = "nodejs"

const MAX_PROOF_BYTES = 4 * 1024 * 1024 // batas aman body di Vercel (4.5 MB)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

type Payload = {
  name?: string
  phone?: string
  note?: string
  address?: string
  pickupMethod?: string
  items?: { id: string; qty: number }[]
  addOnId?: string | null
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

function makeOrderCode() {
  let code = ""
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return `MM-${code}`
}

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("62")) return digits
  if (digits.startsWith("0")) return `62${digits.slice(1)}`
  return digits
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail("Server pemesanan belum terhubung ke database. Tambahkan environment Supabase di Vercel.", 503)
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail("Data pesanan tidak valid.")
  }

  let payload: Payload
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"))
  } catch {
    return fail("Data pesanan tidak valid.")
  }

  const proof = form.get("proof")
  const name = payload.name?.trim() ?? ""
  const phone = normalizePhone(payload.phone ?? "")
  const pickupMethod = payload.pickupMethod
  const address = payload.address?.trim() ?? ""
  const items = Array.isArray(payload.items) ? payload.items : []

  if (!name || name.length > 80) return fail("Nama pembeli wajib diisi.")
  if (phone.length < 10 || phone.length > 15) return fail("Nomor WhatsApp tidak valid.")
  if (pickupMethod !== "pickup" && pickupMethod !== "delivery") return fail("Metode pengambilan tidak valid.")
  if (pickupMethod === "delivery" && !address) return fail("Alamat lengkap wajib diisi untuk delivery.")
  if (items.length === 0) return fail("Keranjang masih kosong.")
  if (!(proof instanceof File) || proof.size === 0) return fail("Bukti pembayaran wajib diunggah.")
  if (!proof.type.startsWith("image/")) return fail("Bukti pembayaran harus berupa gambar.")
  if (proof.size > MAX_PROOF_BYTES) return fail("Ukuran foto maksimal 4 MB.")

  const db = supabaseAdmin()

  // Harga dan stok SELALU diambil dari database, bukan dari klien.
  const ids = items.map((item) => item.id)
  const { data: menus, error: menuError } = await db.from("menus").select("id,name,price,sold_out").in("id", ids)
  if (menuError) return fail("Gagal membaca menu.", 500)

  const lines: { id: string; name: string; qty: number; price: number }[] = []
  for (const item of items) {
    const qty = Math.floor(Number(item.qty))
    const menu = menus?.find((m) => m.id === item.id)
    if (!menu || !Number.isFinite(qty) || qty < 1 || qty > 99) return fail("Item pesanan tidak valid.")
    if (menu.sold_out) return fail(`${menu.name} sedang habis. Hapus dari keranjang ya.`, 409)
    lines.push({ id: menu.id, name: menu.name, qty, price: menu.price })
  }

  const addOn = payload.addOnId ? addOns.find((a) => a.id === payload.addOnId) : undefined
  if (payload.addOnId && !addOn) return fail("Add-on tidak valid.")

  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0) + (addOn?.price ?? 0)
  const readyDate = toISODate(getReadyDate()) // dihitung ulang di server

  // Upload bukti bayar
  const ext = (proof.type.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg"
  const orderCode = makeOrderCode()
  const path = `${readyDate}/${orderCode}-${Date.now()}.${ext}`
  const { error: uploadError } = await db.storage
    .from("payment-proofs")
    .upload(path, Buffer.from(await proof.arrayBuffer()), { contentType: proof.type })
  if (uploadError) return fail("Gagal mengunggah bukti pembayaran.", 500)
  const proofUrl = db.storage.from("payment-proofs").getPublicUrl(path).data.publicUrl

  // Insert; ulangi dengan kode baru jika kebetulan bentrok (unique violation)
  let finalCode = orderCode
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await db.from("orders").insert({
      order_code: finalCode,
      customer_name: name,
      phone,
      items: lines,
      add_on: addOn ? { id: addOn.id, name: addOn.name, price: addOn.price } : null,
      total,
      ready_date: readyDate,
      pickup_method: pickupMethod,
      address: pickupMethod === "delivery" ? address : null,
      note: payload.note?.trim().slice(0, 500) || null,
      payment_proof_url: proofUrl
    })
    if (!error) return NextResponse.json({ orderCode: finalCode, readyDate, total })
    if (error.code !== "23505") break
    finalCode = makeOrderCode()
  }

  await db.storage.from("payment-proofs").remove([path]) // bersihkan file yatim
  return fail("Gagal menyimpan pesanan. Coba lagi.", 500)
}
