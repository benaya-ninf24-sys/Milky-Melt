export type OrderStatus = "menunggu_konfirmasi" | "diproses" | "siap" | "selesai"
export const STATUS_FLOW: OrderStatus[] = ["menunggu_konfirmasi", "diproses", "siap", "selesai"]

export type OrderLine = { id: string; name: string; qty: number; price: number }

export type Order = {
  id: string
  order_code: string
  customer_name: string
  phone: string
  items: OrderLine[]
  add_on: { id: string; name: string; price: number } | null
  total: number
  ready_date: string
  pickup_method: "pickup" | "delivery"
  address: string | null
  note: string | null
  payment_proof_url: string
  payment_confirmed: boolean
  status: OrderStatus
  created_at: string
}
