"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bell, Check, ExternalLink, Heart, Lock, LogOut, MessageCircle, RotateCcw, Settings, X } from "lucide-react"
import { formatReadyDate, fromISODate, rupiah } from "@/lib/shop"
import type { Order, OrderStatus } from "@/lib/admin-types"

type MenuRow = { id: string; name: string; sold_out: boolean }
type Phase = "checking" | "locked" | "in"

const POLL_MS = 5000
const STATUS_LABEL: Record<OrderStatus, string> = {
  menunggu_konfirmasi: "Menunggu Konfirmasi",
  diproses: "Diproses",
  siap: "Siap",
  selesai: "Selesai"
}
const STATUS_STYLE: Record<OrderStatus, string> = {
  menunggu_konfirmasi: "bg-butter text-ink",
  diproses: "bg-lilac/60 text-ink",
  siap: "bg-mint text-[#317156]",
  selesai: "bg-ink/10 text-ink/60"
}
const STATUS_FILTERS: { key: "all" | OrderStatus; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "menunggu_konfirmasi", label: "Perlu dicek" },
  { key: "diproses", label: "Diproses" },
  { key: "siap", label: "Siap" },
  { key: "selesai", label: "Selesai" }
]

const todayWIB = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
const shortDate = (iso: string) => formatReadyDate(fromISODate(iso)).replace(/ \d{4}$/, "")
const timeWIB = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

function waLink(order: Order) {
  const ready = formatReadyDate(fromISODate(order.ready_date))
  const name = order.customer_name
  const code = order.order_code
  const messages: Record<OrderStatus, string> = {
    menunggu_konfirmasi: `Halo kak ${name} 🩷 Pesanan ${code} sudah kami terima. Bukti pembayarannya sedang kami cek ya.`,
    diproses: `Halo kak ${name} 🩷 Pembayaran pesanan ${code} sudah kami konfirmasi. Pesananmu sedang diproses dan ready ${ready}.`,
    siap:
      order.pickup_method === "pickup"
        ? `Halo kak ${name} 🩷 Pesanan ${code} sudah siap diambil di Universitas Katolik Widya Mandala Dinoyo.`
        : `Halo kak ${name} 🩷 Pesanan ${code} sudah siap dan akan segera diantar ke alamatmu.`,
    selesai: `Halo kak ${name} 🩷 Terima kasih sudah memesan Milky Melt! Ditunggu pesanan berikutnya ya.`
  }
  return `https://wa.me/${order.phone}?text=${encodeURIComponent(messages[order.status])}`
}

export default function AdminPage() {
  const [phase, setPhase] = useState<Phase>("checking")
  const [orders, setOrders] = useState<Order[]>([])
  const [menus, setMenus] = useState<MenuRow[]>([])
  const [tab, setTab] = useState<"orders" | "stock" | "settings">("orders")
  const [dateFilter, setDateFilter] = useState<string | null>(null) // null = belum dipilih, "all" = semua
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")
  const [loadError, setLoadError] = useState(false)
  const [newCount, setNewCount] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState("")
  const [pinBusy, setPinBusy] = useState(false)
  const [pinForm, setPinForm] = useState({ current: "", next: "", confirm: "" })
  const [pinMessage, setPinMessage] = useState("")
  const knownIds = useRef<Set<string> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders", { cache: "no-store" })
      if (res.status === 401) {
        setPhase("locked")
        return
      }
      if (!res.ok) throw new Error()
      const data: { orders: Order[]; menus: MenuRow[] } = await res.json()
      const incoming = data.orders
      if (knownIds.current === null) {
        knownIds.current = new Set(incoming.map((o) => o.id))
      } else {
        const fresh = incoming.filter((o) => !knownIds.current!.has(o.id))
        if (fresh.length) {
          fresh.forEach((o) => knownIds.current!.add(o.id))
          setNewCount((n) => n + fresh.length)
        }
      }
      setOrders(incoming)
      setMenus(data.menus)
      setLoadError(false)
      setLastUpdated(new Date())
      setPhase("in")
    } catch {
      setLoadError(true)
      setPhase((p) => (p === "checking" ? "locked" : p))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Daftar pesanan diperbarui otomatis tanpa refresh
  useEffect(() => {
    if (phase !== "in") return
    const tick = () => {
      if (!document.hidden) load()
    }
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [phase, load])

  const dates = useMemo(() => Array.from(new Set(orders.map((o) => o.ready_date))).sort(), [orders])

  // Pilihan awal: jadwal ready terdekat (hari ini atau setelahnya)
  useEffect(() => {
    if (dateFilter !== null || dates.length === 0) return
    const today = todayWIB()
    setDateFilter(dates.find((d) => d >= today) ?? dates[dates.length - 1])
  }, [dates, dateFilter])

  const byDate = useMemo(() => orders.filter((o) => dateFilter === "all" || dateFilter === null || o.ready_date === dateFilter), [orders, dateFilter])
  const visible = useMemo(() => byDate.filter((o) => statusFilter === "all" || o.status === statusFilter), [byDate, statusFilter])
  const statusCount = (key: "all" | OrderStatus) => (key === "all" ? byDate.length : byDate.filter((o) => o.status === key).length)

  // Rekap produksi: hanya pesanan yang pembayarannya sudah dikonfirmasi
  const recap = useMemo(() => {
    const confirmed = byDate.filter((o) => o.payment_confirmed)
    const qty = new Map<string, number>()
    const bags = new Map<string, number>()
    for (const o of confirmed) {
      for (const line of o.items) qty.set(line.id, (qty.get(line.id) ?? 0) + line.qty)
      if (o.add_on) bags.set(o.add_on.name, (bags.get(o.add_on.name) ?? 0) + 1)
    }
    const rows = menus.filter((m) => qty.has(m.id)).map((m) => ({ name: m.name, qty: qty.get(m.id) ?? 0 }))
    const pcs = rows.reduce((s, r) => s + r.qty, 0)
    const pending = byDate.filter((o) => !o.payment_confirmed).reduce((s, o) => s + o.items.reduce((x, l) => x + l.qty, 0), 0)
    return { rows, pcs, bags: Array.from(bags), pending, orders: confirmed.length }
  }, [byDate, menus])

  const login = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!pin || pinBusy) return
    setPinBusy(true)
    setPinError("")
    try {
      const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Gagal masuk.")
      setPin("")
      setPhase("checking")
      await load()
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "Gagal masuk.")
    } finally {
      setPinBusy(false)
    }
  }

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" })
    knownIds.current = null
    setOrders([])
    setNewCount(0)
    setDateFilter(null)
    setPhase("locked")
  }

  const updatePin = async (event: React.FormEvent) => {
    event.preventDefault()
    setPinMessage("")
    if (pinForm.next !== pinForm.confirm) return setPinMessage("Konfirmasi PIN baru tidak sama.")
    setPinBusy(true)
    try {
      const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPin: pinForm.current, nextPin: pinForm.next }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Gagal mengganti PIN.")
      setPinForm({ current: "", next: "", confirm: "" })
      setPinMessage("PIN berhasil diganti.")
    } catch (error) {
      setPinMessage(error instanceof Error ? error.message : "Gagal mengganti PIN.")
    } finally {
      setPinBusy(false)
    }
  }

  const act = async (order: Order, action: "confirm_payment" | "advance" | "back") => {
    setBusyId(order.id)
    setActionError("")
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) return setPhase("locked")
      if (!res.ok) setActionError(data.error ?? "Gagal memperbarui pesanan.")
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const toggleStock = async (menu: MenuRow) => {
    const next = !menu.sold_out
    setMenus((current) => current.map((m) => (m.id === menu.id ? { ...m, sold_out: next } : m)))
    const res = await fetch(`/api/admin/menus/${menu.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sold_out: next }) })
    if (res.status === 401) return setPhase("locked")
    if (!res.ok) setActionError("Gagal mengubah stok.")
    await load()
  }

  if (phase === "checking") {
    return <main className="grid min-h-screen place-items-center bg-cream text-sm font-semibold text-ink/50">Memuat...</main>
  }

  if (phase === "locked") {
    return (
      <main className="grid min-h-screen place-items-center bg-cream px-4">
        <form onSubmit={login} className="w-full max-w-xs rounded-[2rem] bg-white p-7 text-center shadow-soft">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose text-white"><Lock size={24} aria-hidden="true" /></div>
          <h1 className="mt-4 font-serif text-2xl font-black text-ink">Area Penjual</h1>
          <p className="mt-1 text-xs text-ink/55">Masukkan PIN untuk membuka daftar pesanan.</p>
          <label className="sr-only" htmlFor="pin">PIN</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            className="mt-5 min-h-12 w-full rounded-xl border border-rose/15 bg-cream text-center text-xl font-black tracking-[0.5em] outline-none focus:border-rose focus:ring-4 focus:ring-rose/10"
          />
          {pinError && <p role="alert" className="mt-3 text-xs font-bold text-rose-deep">{pinError}</p>}
          {loadError && !pinError && <p role="alert" className="mt-3 text-xs font-bold text-rose-deep">Tidak bisa menghubungi server.</p>}
          <button type="submit" disabled={!pin || pinBusy} className="mt-4 min-h-12 w-full rounded-full bg-ink text-sm font-bold text-white transition hover:bg-rose-deep disabled:opacity-40">{pinBusy ? "Memeriksa..." : "Masuk"}</button>
        </form>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-cream pb-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-rose text-white"><Heart size={18} fill="currentColor" aria-hidden="true" /></div>
            <div>
              <h1 className="font-serif text-lg font-black leading-tight text-ink">Milky Melt Admin</h1>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink/50">
                <span className={`h-2 w-2 rounded-full ${loadError ? "bg-rose-deep" : "animate-pulse bg-[#4caf8a]"}`} />
                {loadError ? "Koneksi terputus, mencoba lagi..." : `Live • ${lastUpdated ? lastUpdated.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" }) : ""}`}
              </p>
            </div>
          </div>
          <button type="button" onClick={logout} className="flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-bold text-ink/70 shadow-sm hover:text-ink"><LogOut size={14} aria-hidden="true" /> Keluar</button>
        </header>

        <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl bg-white p-1.5 text-sm font-black">
          {(["orders", "stock", "settings"] as const).map((key) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`min-h-11 rounded-xl transition ${tab === key ? "bg-rose text-white" : "text-ink/55 hover:bg-blush"}`}>{key === "orders" ? "Pesanan" : key === "stock" ? "Stok menu" : "Settings"}</button>
          ))}
        </div>

        {actionError && (
          <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm font-bold text-rose-deep">
            <span>{actionError}</span>
            <button type="button" aria-label="Tutup pesan" onClick={() => setActionError("")}><X size={16} /></button>
          </div>
        )}

        {tab === "stock" && (
          <section className="rounded-2xl bg-white p-2">
            <p className="px-3 pb-2 pt-3 text-xs text-ink/55">Matikan saklar untuk menandai varian sebagai Sold Out di halaman pembeli.</p>
            {menus.map((menu) => (
              <div key={menu.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-3">
                <div>
                  <p className="text-sm font-extrabold text-ink">{menu.name}</p>
                  <p className={`text-xs font-bold ${menu.sold_out ? "text-rose-deep" : "text-[#317156]"}`}>{menu.sold_out ? "Sold out" : "Tersedia"}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!menu.sold_out}
                  aria-label={`${menu.name} tersedia`}
                  onClick={() => toggleStock(menu)}
                  className={`relative h-8 w-14 shrink-0 rounded-full transition ${menu.sold_out ? "bg-ink/20" : "bg-[#4caf8a]"}`}
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${menu.sold_out ? "left-1" : "left-7"}`} />
                </button>
              </div>
            ))}
          </section>
        )}

        {tab === "settings" && (
          <section className="max-w-xl rounded-2xl bg-white p-5 shadow-card">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blush text-rose-deep"><Settings size={19} aria-hidden="true" /></div>
              <div><h2 className="text-lg font-black text-ink">Pengaturan admin</h2><p className="mt-1 text-xs leading-5 text-ink/55">Ganti PIN akses dashboard. PIN hanya disimpan sebagai hash di database.</p></div>
            </div>
            <form onSubmit={updatePin} className="mt-5 space-y-3">
              <label className="block text-sm font-bold text-ink">PIN lama<input value={pinForm.current} onChange={(e) => setPinForm({ ...pinForm, current: e.target.value.replace(/\D/g, "") })} inputMode="numeric" type="password" maxLength={12} className="mt-2 min-h-12 w-full rounded-xl border border-rose/15 bg-cream px-4 text-sm tracking-[0.3em] outline-none focus:border-rose focus:ring-4 focus:ring-rose/10" /></label>
              <label className="block text-sm font-bold text-ink">PIN baru <span className="font-normal text-ink/45">(6–12 angka)</span><input value={pinForm.next} onChange={(e) => setPinForm({ ...pinForm, next: e.target.value.replace(/\D/g, "") })} inputMode="numeric" type="password" maxLength={12} className="mt-2 min-h-12 w-full rounded-xl border border-rose/15 bg-cream px-4 text-sm tracking-[0.3em] outline-none focus:border-rose focus:ring-4 focus:ring-rose/10" /></label>
              <label className="block text-sm font-bold text-ink">Ulangi PIN baru<input value={pinForm.confirm} onChange={(e) => setPinForm({ ...pinForm, confirm: e.target.value.replace(/\D/g, "") })} inputMode="numeric" type="password" maxLength={12} className="mt-2 min-h-12 w-full rounded-xl border border-rose/15 bg-cream px-4 py-3 text-sm tracking-[0.3em] outline-none focus:border-rose focus:ring-4 focus:ring-rose/10" /></label>
              {pinMessage && <p role="status" className="rounded-xl bg-blush px-3 py-2 text-sm font-bold text-rose-deep">{pinMessage}</p>}
              <button type="submit" disabled={pinBusy || !pinForm.current || !pinForm.next || !pinForm.confirm} className="min-h-12 w-full rounded-full bg-ink text-sm font-bold text-white hover:bg-rose-deep disabled:cursor-not-allowed disabled:opacity-40">{pinBusy ? "Menyimpan..." : "Simpan PIN baru"}</button>
            </form>
          </section>
        )}

        {tab === "orders" && (
          <>
            {newCount > 0 && (
              <button type="button" onClick={() => setNewCount(0)} className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-deep px-4 py-3 text-sm font-black text-white">
                <Bell size={16} aria-hidden="true" /> {newCount} pesanan baru masuk • ketuk untuk menutup
              </button>
            )}

            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {["all", ...dates].map((d) => (
                <button key={d} type="button" onClick={() => setDateFilter(d)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${dateFilter === d ? "bg-ink text-white" : "bg-white text-ink/60 hover:bg-blush"}`}>
                  {d === "all" ? "Semua jadwal" : `Ready ${shortDate(d)}`}
                </button>
              ))}
            </div>

            <section className="mb-5 rounded-2xl border border-rose/15 bg-white p-4" aria-labelledby="recap-title">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="recap-title" className="text-sm font-black text-ink">Rekap produksi</h2>
                <span className="text-xs font-bold text-rose-deep">{recap.pcs} pcs • {recap.orders} pesanan</span>
              </div>
              {recap.rows.length === 0 ? (
                <p className="mt-3 text-sm text-ink/50">Belum ada pesanan terkonfirmasi untuk jadwal ini.</p>
              ) : (
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {recap.rows.map((row) => (
                    <li key={row.name} className="flex items-center justify-between rounded-xl bg-cream px-3 py-2.5 text-sm font-bold text-ink">
                      <span>{row.name}</span><span className="rounded-full bg-rose px-2.5 py-0.5 text-xs text-white">{row.qty} pcs</span>
                    </li>
                  ))}
                </ul>
              )}
              {recap.bags.length > 0 && <p className="mt-3 text-xs font-semibold text-ink/60">Thermal bag: {recap.bags.map(([name, n]) => `${name} × ${n}`).join(", ")}</p>}
              {recap.pending > 0 && <p className="mt-2 text-xs text-ink/45">Belum termasuk {recap.pending} pcs yang pembayarannya belum dikonfirmasi.</p>}
            </section>

            <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {STATUS_FILTERS.map((f) => (
                <button key={f.key} type="button" onClick={() => setStatusFilter(f.key)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${statusFilter === f.key ? "border-rose bg-blush text-rose-deep" : "border-rose/10 bg-white text-ink/55"}`}>
                  {f.label} <span className="opacity-60">{statusCount(f.key)}</span>
                </button>
              ))}
            </div>

            {visible.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-sm text-ink/50">Belum ada pesanan.</p>}

            <div className="grid gap-4 md:grid-cols-2">
              {visible.map((order) => {
                const busy = busyId === order.id
                const pcs = order.items.reduce((s, l) => s + l.qty, 0)
                const nextLabel =
                  order.status === "diproses" ? (order.pickup_method === "pickup" ? "Siap diambil" : "Siap diantar") : order.status === "siap" ? "Tandai selesai" : ""
                return (
                  <article key={order.id} className="rounded-2xl border border-rose/10 bg-white p-4 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black tracking-wider text-rose-deep">{order.order_code}</p>
                        <h3 className="mt-0.5 text-base font-black text-ink">{order.customer_name}</h3>
                        <p className="text-xs text-ink/50">{timeWIB(order.created_at)} WIB • {order.phone}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${STATUS_STYLE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
                    </div>

                    <ul className="mt-3 space-y-1 border-t border-rose/10 pt-3 text-sm text-ink/75">
                      {order.items.map((line) => (
                        <li key={line.id} className="flex justify-between gap-3"><span>{line.name} <strong className="text-rose-deep">× {line.qty}</strong></span><span className="font-bold text-ink">{rupiah(line.price * line.qty)}</span></li>
                      ))}
                      {order.add_on && <li className="flex justify-between gap-3"><span>{order.add_on.name}</span><span className="font-bold text-ink">{rupiah(order.add_on.price)}</span></li>}
                      <li className="flex justify-between gap-3 border-t border-rose/10 pt-2 font-black text-ink"><span>Total • {pcs} pcs</span><span>{rupiah(order.total)}</span></li>
                    </ul>

                    <div className="mt-3 rounded-xl bg-cream p-3 text-xs leading-5 text-ink/70">
                      <p><strong className="text-ink">Ready:</strong> {formatReadyDate(fromISODate(order.ready_date))}</p>
                      <p><strong className="text-ink">{order.pickup_method === "pickup" ? "Pick-up" : "Delivery"}:</strong> {order.pickup_method === "pickup" ? "Widya Mandala Dinoyo" : order.address}</p>
                      {order.note && <p><strong className="text-ink">Catatan:</strong> {order.note}</p>}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setProofUrl(order.payment_proof_url)} className="flex min-h-10 items-center gap-1.5 rounded-full border border-rose/20 px-3.5 text-xs font-bold text-rose-deep hover:bg-blush"><ExternalLink size={13} aria-hidden="true" /> Bukti bayar</button>
                      <a href={waLink(order)} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-1.5 rounded-full bg-[#25a35a] px-3.5 text-xs font-bold text-white hover:brightness-110"><MessageCircle size={13} aria-hidden="true" /> WhatsApp</a>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      {order.status === "menunggu_konfirmasi" && (
                        <button type="button" disabled={busy} onClick={() => act(order, "confirm_payment")} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-rose text-sm font-bold text-white hover:bg-rose-deep disabled:opacity-50"><Check size={16} aria-hidden="true" /> {busy ? "Menyimpan..." : "Konfirmasi pembayaran"}</button>
                      )}
                      {nextLabel && (
                        <button type="button" disabled={busy} onClick={() => act(order, "advance")} className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-ink text-sm font-bold text-white hover:bg-rose-deep disabled:opacity-50">{busy ? "Menyimpan..." : nextLabel}</button>
                      )}
                      {order.status !== "menunggu_konfirmasi" && (
                        <button type="button" disabled={busy} onClick={() => act(order, "back")} aria-label="Kembalikan ke tahap sebelumnya" title="Kembalikan ke tahap sebelumnya" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-rose/15 text-ink/50 hover:bg-blush disabled:opacity-50"><RotateCcw size={15} /></button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>

      {proofUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" role="dialog" aria-modal="true" aria-label="Bukti pembayaran" onClick={() => setProofUrl(null)}>
          <div className="relative max-h-full w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Tutup" onClick={() => setProofUrl(null)} className="absolute -top-3 -right-3 grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-md"><X size={18} /></button>
            <img src={proofUrl} alt="Bukti pembayaran QRIS" className="max-h-[85vh] w-full rounded-2xl bg-white object-contain" />
          </div>
        </div>
      )}
    </main>
  )
}
