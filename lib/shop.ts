export type Product = {
  id: string
  name: string
  price: number
  flavor: string | null
  image_url: string | null
  sold_out: boolean
}
export type AddOn = { id: string; name: string; price: number; note: string }
export type PickupMethod = "pickup" | "delivery"

export const addOns: AddOn[] = [
  { id: "small-bag", name: "Thermal Bag Kecil", price: 5000, note: "Muatan 2–3 pcs" },
  { id: "large-bag", name: "Thermal Bag Besar", price: 7000, note: "Muatan 4–8 pcs" }
]

export const fallbackProducts: Product[] = [
  { id: "vanilla-oreo", name: "Vanilla Oreo", price: 10000, flavor: "Classic creamy", image_url: null, sold_out: false },
  { id: "matcha-strawberry", name: "Matcha Strawberry", price: 12000, flavor: "Fresh & earthy", image_url: null, sold_out: false },
  { id: "coklat-regal", name: "Coklat Regal", price: 10000, flavor: "Rich chocolate", image_url: null, sold_out: false },
  { id: "cheese-regal", name: "Cheese Regal", price: 12000, flavor: "Cheesy crumb", image_url: null, sold_out: false },
  { id: "strawberry", name: "Strawberry", price: 12000, flavor: "Berry sweet", image_url: null, sold_out: false },
  { id: "red-velvet", name: "Red Velvet Chocochip", price: 12000, flavor: "Velvety bites", image_url: null, sold_out: false },
  { id: "thai-tea", name: "Thai Tea Cheese", price: 10000, flavor: "Tea cream cloud", image_url: null, sold_out: false },
  { id: "sweet-manggo", name: "Sweet Manggo", price: 12000, flavor: "Sunny & juicy", image_url: null, sold_out: false }
]

const weekdayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

const CUTOFF_HOUR = 15 // WIB

/**
 * Aturan jadwal ready (waktu WIB):
 * 1. Pesanan masuk lewat 15.00, atau di akhir pekan, dianggap dipesan di hari kerja berikutnya.
 * 2. Ready = hari kerja setelah hari pesanan dihitung (H-1).
 * Contoh: Kamis 14.00 -> Jumat | Kamis 16.00 -> Senin | Jumat 16.00 -> Selasa | Minggu -> Selasa
 */
export function getReadyDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const hour = get("hour") % 24 // beberapa runtime mengembalikan 24 untuk tengah malam
  const minute = get("minute")
  const afterCutoff = hour > CUTOFF_HOUR || (hour === CUTOFF_HOUR && minute > 0)

  const placed = new Date(Date.UTC(get("year"), get("month") - 1, get("day")))
  if (afterCutoff) placed.setUTCDate(placed.getUTCDate() + 1)
  skipWeekend(placed)

  const ready = new Date(placed)
  ready.setUTCDate(ready.getUTCDate() + 1)
  skipWeekend(ready)
  return ready
}

function skipWeekend(date: Date) {
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1)
}

export function toISODate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function fromISODate(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

export function formatReadyDate(date: Date) {
  return `${weekdayNames[date.getUTCDay()]}, ${date.getUTCDate()} ${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

export function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value)
}
