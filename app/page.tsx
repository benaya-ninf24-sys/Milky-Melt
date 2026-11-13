"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, Check, ChevronRight, Clock3, Minus, Plus, ShoppingBag, Sparkles, Truck, Upload, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { addOns, fallbackProducts, formatReadyDate, fromISODate, getReadyDate, rupiah, type PickupMethod, type Product } from "@/lib/shop"

const MAX_PROOF_BYTES = 4 * 1024 * 1024
const tints = ["bg-[#fff1c8]", "bg-[#dff0e8]", "bg-[#f3d9d4]", "bg-[#e7d9f0]"]
const localProductImages: Record<string, string> = {
  "vanilla-oreo": "/products/vanilla-oreo.png",
  "matcha-strawberry": "/products/matcha-strawberry.png",
  "coklat-regal": "/products/coklat-regal.png",
  "cheese-regal": "/products/cheese-regal.png",
  strawberry: "/products/strawberry.png",
  "red-velvet": "/products/red-velvet.png",
  "thai-tea": "/products/thai-tea.png",
  "sweet-manggo": "/products/sweet-manggo.png"
}
const inputCls = "mt-2 min-h-12 w-full rounded-xl border border-rose/15 bg-cream px-4 text-sm outline-none transition focus:border-rose focus:ring-4 focus:ring-rose/10"

type Receipt = { orderCode: string; readyDate: string; total: number }

export default function Home() {
  const [products, setProducts] = useState<Product[]>([])
  const [menuState, setMenuState] = useState<"loading" | "ready" | "error">("loading")
  const [cart, setCart] = useState<Record<string, number>>({})
  const [selectedAddOn, setSelectedAddOn] = useState<string | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [customer, setCustomer] = useState({ name: "", phone: "", note: "", address: "" })
  const [pickupMethod, setPickupMethod] = useState<PickupMethod>("pickup")
  const [paymentProof, setPaymentProof] = useState<File | null>(null)
  const [paymentPreview, setPaymentPreview] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [step, setStep] = useState(1)
  const [showErrors, setShowErrors] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const readyDate = useMemo(() => getReadyDate(), [])

  // Muat menu + update stok otomatis bila penjual mengubah Sold Out
  useEffect(() => {
    let active = true
    const load = async () => {
      if (!supabase) {
        setProducts(fallbackProducts)
        setMenuState("ready")
        return
      }
      const { data, error } = await supabase.from("menus").select("*").order("sort_order")
      if (!active) return
      if (error || !data) return setMenuState((s) => (s === "ready" ? s : "error"))
      setProducts(data as Product[])
      setMenuState("ready")
      // buang item yang tiba-tiba habis dari keranjang
      const soldOut = new Set(data.filter((p) => p.sold_out).map((p) => p.id))
      setCart((current) => {
        const kept = Object.fromEntries(Object.entries(current).filter(([id]) => !soldOut.has(id)))
        return Object.keys(kept).length === Object.keys(current).length ? current : kept
      })
    }
    load()
    const timer = setInterval(load, 30000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  useEffect(() => () => { if (paymentPreview) URL.revokeObjectURL(paymentPreview) }, [paymentPreview])

  const totalItems = Object.values(cart).reduce((sum, qty) => sum + qty, 0)
  const subtotal = products.reduce((sum, p) => sum + (cart[p.id] ?? 0) * p.price, 0)
  const addOn = addOns.find((a) => a.id === selectedAddOn)
  const total = subtotal + (addOn?.price ?? 0)
  const selectedProducts = products.filter((p) => (cart[p.id] ?? 0) > 0)
  const phoneDigits = customer.phone.replace(/\D/g, "")
  const phoneOk = phoneDigits.length >= 10 && phoneDigits.length <= 15
  const nameOk = customer.name.trim().length > 0
  const addressOk = pickupMethod === "pickup" || customer.address.trim().length > 0
  const step2Valid = nameOk && phoneOk && addressOk
  const canCheckout = totalItems > 0 && step2Valid && Boolean(paymentProof)
  const bad = (condition: boolean) => showErrors && condition
  const stepLabels = ["Pesanan", "Data", "Bayar"]

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [step])

  const updateQuantity = (id: string, delta: number) => {
    setCart((current) => {
      const next = Math.max(0, (current[id] ?? 0) + delta)
      const updated = { ...current }
      if (next === 0) delete updated[id]
      else updated[id] = next
      return updated
    })
  }

  const handleProofChange = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) return setError("Bukti pembayaran harus berupa gambar.")
    if (file.size > MAX_PROOF_BYTES) return setError("Ukuran foto maksimal 4 MB.")
    setError("")
    setPaymentProof(file)
    setPaymentPreview(URL.createObjectURL(file)) // preview lama di-revoke oleh effect di atas
  }

  const submitOrder = async () => {
    if (!canCheckout || !paymentProof || submitting) return
    setSubmitting(true)
    setError("")
    try {
      const body = new FormData()
      body.append(
        "payload",
        JSON.stringify({
          name: customer.name,
          phone: customer.phone,
          note: customer.note,
          address: customer.address,
          pickupMethod,
          items: Object.entries(cart).map(([id, qty]) => ({ id, qty })),
          addOnId: selectedAddOn
        })
      )
      body.append("proof", paymentProof)
      const res = await fetch("/api/orders", { method: "POST", body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Gagal mengirim pesanan.")
      setReceipt(data as Receipt)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim pesanan.")
    } finally {
      setSubmitting(false)
    }
  }

  const goNext = () => {
    setError("")
    if (step === 1) {
      setShowErrors(false)
      setStep(2)
      return
    }
    if (step === 2) {
      if (!step2Valid) {
        setShowErrors(true)
        return
      }
      setShowErrors(false)
      setStep(3)
      return
    }
    if (!paymentProof) {
      setShowErrors(true)
      return
    }
    submitOrder()
  }

  const goBack = () => {
    setError("")
    setShowErrors(false)
    setStep((current) => Math.max(1, current - 1))
  }

  const finish = () => {
    setReceipt(null)
    setShowCheckout(false)
    setCart({})
    setSelectedAddOn(null)
    setCustomer({ name: "", phone: "", note: "", address: "" })
    setPaymentProof(null)
    setPaymentPreview("")
    setError("")
    setStep(1)
    setShowErrors(false)
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-cream">
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-20 top-32 h-52 w-52 rounded-full bg-blush blur-3xl" />
        <div className="absolute -right-20 top-[42rem] h-64 w-64 rounded-full bg-lilac/70 blur-3xl" />
      </div>
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-28 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 py-6">
          <div className="flex items-center gap-3">
            <div>
              <p className="font-sans text-lg font-bold leading-tight tracking-tight text-ink">Milky Melt</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-deep">Ice Cream Sandwich</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-rose-deep px-3.5 py-2.5 text-[11px] font-black uppercase tracking-wide text-white shadow-md shadow-rose/20">PO H-1 • 15.00 WIB</span>
        </header>

        <section className="relative overflow-hidden rounded-[2rem] bg-[#f7d8df] px-6 py-8 shadow-soft sm:px-10 sm:py-11">
          <div className="relative z-10 max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-rose-deep"><Sparkles size={14} aria-hidden="true" /> Homemade, soft & dreamy</div>
            <h1 className="font-sans text-4xl font-black leading-[1.05] tracking-tight text-ink sm:text-6xl">Gabin dingin,<br /><span className="text-rose-deep">mood makin manis.</span></h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-ink/75 sm:text-base">Sandwich es krim creamy dengan isian playful untuk nemenin hari kamu. Pilih favoritmu, kami siapkan fresh sesuai jadwal.</p>
            <a href="#menu" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-rose-deep focus:outline-none focus:ring-4 focus:ring-white/70">Lihat menu <ChevronRight size={17} aria-hidden="true" /></a>
          </div>
          <div className="absolute -right-14 -top-14 h-56 w-56 rounded-full border-[18px] border-white/50 sm:h-72 sm:w-72" />
          <div className="absolute -bottom-16 right-10 h-40 w-40 rounded-full bg-[#fff4c9]/80 blur-sm" />
          <div className="absolute bottom-7 right-8 hidden rotate-6 rounded-[1.5rem] bg-white/85 p-4 shadow-card sm:block"><div className="mb-2 h-24 w-24 rounded-2xl bg-gradient-to-br from-[#fff1c8] via-white to-[#e9c2ed]" /><p className="text-center text-xs font-bold text-ink">made with ♡</p></div>
        </section>

        <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-rose/20 bg-white/90 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-labelledby="ready-title">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blush text-rose-deep"><CalendarDays size={20} aria-hidden="true" /></div>
            <div><p id="ready-title" className="text-xs font-bold uppercase tracking-[0.15em] text-rose-deep">Jadwal Ready Pesananmu</p><p className="mt-1 text-lg font-black text-ink">{formatReadyDate(readyDate)}</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-xs font-semibold text-ink/70"><Clock3 size={15} className="text-rose-deep" aria-hidden="true" /> Order sebelum 15.00 WIB</div>
        </section>

        <section id="menu" className="mt-12 scroll-mt-6">
          <div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-deep">Pick your melt</p><h2 className="mt-1 font-sans text-3xl font-black text-ink">Menu favorit</h2></div><span className="text-sm font-semibold text-ink/50">{totalItems} item dipilih</span></div>
          {menuState === "loading" && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-[1.35rem] bg-white/70" />)}</div>}
          {menuState === "error" && <p role="alert" className="rounded-2xl bg-white p-6 text-center text-sm text-ink/70">Menu belum bisa dimuat. Coba muat ulang halaman ya.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product, index) => {
              const quantity = cart[product.id] ?? 0
              const imageUrl = product.image_url || localProductImages[product.id]
              return <article key={product.id} className={`group rounded-[1.35rem] border border-rose/10 bg-white p-3 shadow-card transition hover:-translate-y-1 hover:shadow-soft ${product.sold_out ? "opacity-70" : ""}`}>
                <div className={`relative mb-3 flex aspect-square items-end justify-start overflow-hidden rounded-xl ${imageUrl ? "" : `p-3 ${tints[index % 4]}`}`}>
                  {imageUrl
                    ? <img src={imageUrl} alt={product.name} loading="lazy" className={`absolute inset-0 h-full w-full object-cover ${product.sold_out ? "grayscale" : ""}`} />
                    : <><div className="absolute right-3 top-3 h-16 w-16 rounded-full bg-white/70 blur-[1px]" /><div className="relative"><span className="block h-16 w-16 -rotate-6 rounded-[1.1rem] border-4 border-white bg-gradient-to-br from-white/90 to-rose/30 shadow-md" /><span className="absolute -right-2 top-5 block h-8 w-8 rounded-full bg-white/80" /></div></>}
                  {product.sold_out && <span className="absolute left-2 top-2 rounded-full bg-ink px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">Sold out</span>}
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-deep">{product.flavor}</p>
                <h3 className="mt-1 min-h-10 text-sm font-extrabold leading-5 text-ink">{product.name}</h3>
                <div className="mt-3 flex items-center justify-between gap-2"><span className="text-sm font-black text-ink">{rupiah(product.price)}</span>
                  {product.sold_out
                    ? <span className="text-xs font-bold text-ink/40">Habis</span>
                    : <div className="flex items-center gap-1 rounded-full bg-blush p-1">
                        <button type="button" aria-label={`Kurangi ${product.name}`} onClick={() => updateQuantity(product.id, -1)} className="grid h-7 w-7 place-items-center rounded-full text-rose-deep transition hover:bg-white disabled:opacity-40" disabled={quantity === 0}><Minus size={14} strokeWidth={2.5} /></button>
                        <span className="w-4 text-center text-xs font-bold text-ink" aria-live="polite">{quantity}</span>
                        <button type="button" aria-label={`Tambah ${product.name}`} onClick={() => updateQuantity(product.id, 1)} className="grid h-7 w-7 place-items-center rounded-full bg-rose text-white transition hover:bg-rose-deep"><Plus size={14} strokeWidth={2.5} /></button>
                      </div>}
                </div>
              </article>
            })}
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-deep">Optional extra</p><h2 className="mt-1 font-sans text-3xl font-black text-ink">Biar tetap dingin ♡</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {addOns.map((a) => <button type="button" key={a.id} onClick={() => setSelectedAddOn(selectedAddOn === a.id ? null : a.id)} aria-pressed={selectedAddOn === a.id} className={`flex min-h-[76px] items-center justify-between rounded-2xl border p-4 text-left transition ${selectedAddOn === a.id ? "border-rose bg-blush shadow-card" : "border-rose/10 bg-white hover:border-rose/30"}`}>
              <span><span className="block text-sm font-extrabold text-ink">{a.name}</span><span className="mt-1 block text-xs text-ink/55">{a.note}</span></span><span className="flex items-center gap-3 text-sm font-black text-rose-deep">{rupiah(a.price)}<span className={`grid h-7 w-7 place-items-center rounded-full border ${selectedAddOn === a.id ? "border-rose bg-rose text-white" : "border-rose/20 text-transparent"}`}><Check size={14} /></span></span>
            </button>)}
          </div>
        </section>

        <footer className="mt-14 border-t border-rose/10 pt-6 text-center text-xs leading-5 text-ink/45">Made with love for your little sweet moments.<br />Milky Melt — weekday pre-order only.</footer>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4 rounded-2xl bg-ink px-4 py-3 text-white shadow-soft ring-4 ring-white/60">
          <div className="flex items-center gap-3"><span className="relative grid h-10 w-10 place-items-center rounded-xl bg-rose"><ShoppingBag size={18} aria-hidden="true" /><span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-butter px-1 text-[10px] font-black text-ink">{totalItems}</span></span><div><p className="text-[11px] font-semibold text-white/60">Keranjangmu</p><p className="text-base font-black">{rupiah(total)}</p></div></div>
          <button type="button" onClick={() => setShowCheckout(true)} disabled={totalItems === 0} className="flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-ink transition hover:bg-blush disabled:cursor-not-allowed disabled:opacity-40">Checkout <ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      </div>

      {showCheckout && !receipt && totalItems > 0 && <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <div className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-cream shadow-soft sm:rounded-[2rem]">
          <div className="shrink-0 px-5 pb-3 pt-5">
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-deep">Almost yours</p><h2 id="checkout-title" className="mt-1 font-sans text-2xl font-black text-ink">Checkout manis</h2></div>
              <button type="button" aria-label="Tutup checkout" onClick={() => setShowCheckout(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink/60 shadow-sm hover:text-ink"><X size={18} /></button>
            </div>
            <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Langkah checkout">
              {stepLabels.map((label, index) => {
                const number = index + 1
                return <li key={label} aria-current={step === number ? "step" : undefined}>
                  <div className={`h-1.5 rounded-full transition ${step >= number ? "bg-rose" : "bg-rose/15"}`} />
                  <p className={`mt-1.5 text-[10px] font-black uppercase tracking-wider ${step === number ? "text-rose-deep" : "text-ink/40"}`}>{String(number).padStart(2, "0")} {label}</p>
                </li>
              })}
            </ol>
          </div>

          <div ref={bodyRef} className="scrollbar-hide flex-1 space-y-4 overflow-y-auto px-5 py-3">
            {step === 1 && <div className="space-y-4">
              <section className="rounded-2xl bg-white p-4">
                <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black text-ink">Cek pesananmu</h3><span className="text-xs font-semibold text-rose-deep">{totalItems} item</span></div>
                <ul className="divide-y divide-rose/10">
                  {selectedProducts.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0"><p className="truncate text-sm font-extrabold text-ink">{p.name}</p><p className="text-xs text-ink/50">{rupiah(p.price)} / pcs</p></div>
                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-blush p-1">
                      <button type="button" aria-label={`Kurangi ${p.name}`} onClick={() => updateQuantity(p.id, -1)} className="grid h-8 w-8 place-items-center rounded-full text-rose-deep hover:bg-white"><Minus size={14} /></button>
                      <span className="w-5 text-center text-sm font-bold text-ink" aria-live="polite">{cart[p.id]}</span>
                      <button type="button" aria-label={`Tambah ${p.name}`} onClick={() => updateQuantity(p.id, 1)} className="grid h-8 w-8 place-items-center rounded-full bg-rose text-white hover:bg-rose-deep"><Plus size={14} /></button>
                    </div>
                  </li>)}
                </ul>
                <div className="mt-3 flex justify-between border-t border-rose/10 pt-3 text-sm font-black text-ink"><span>Total sementara</span><span>{rupiah(subtotal)}</span></div>
              </section>
              <section className="rounded-2xl bg-white p-4">
                <h3 className="text-sm font-black text-ink">Tambah thermal bag? <span className="font-normal text-ink/45">(opsional)</span></h3>
                <div className="mt-3 grid grid-cols-2 gap-2">{addOns.map((a) => <button type="button" key={a.id} aria-pressed={selectedAddOn === a.id} onClick={() => setSelectedAddOn(selectedAddOn === a.id ? null : a.id)} className={`rounded-xl border p-3 text-left transition ${selectedAddOn === a.id ? "border-rose bg-blush" : "border-rose/15 hover:border-rose/40"}`}><span className="block text-xs font-extrabold text-ink">{a.name}</span><span className="mt-1 block text-[11px] text-ink/50">{a.note}</span><span className="mt-1 block text-xs font-black text-rose-deep">{rupiah(a.price)}</span></button>)}</div>
              </section>
              <div className="flex items-center gap-3 rounded-2xl border border-rose/15 bg-blush p-4"><CalendarDays size={20} className="shrink-0 text-rose-deep" aria-hidden="true" /><div><p className="text-[11px] font-bold uppercase tracking-wider text-rose-deep">Jadwal ready</p><p className="font-black text-ink">{formatReadyDate(readyDate)}</p><p className="mt-1 text-xs text-ink/60">Siap di hari operasional berikutnya.</p></div></div>
              <label className="block text-sm font-bold text-ink">Catatan untuk penjual <span className="font-normal text-ink/45">(opsional)</span><textarea value={customer.note} onChange={(e) => setCustomer({ ...customer, note: e.target.value })} placeholder="Contoh: tolong pisahkan varian..." rows={2} maxLength={500} className="mt-2 w-full resize-none rounded-xl border border-rose/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-rose focus:ring-4 focus:ring-rose/10" /></label>
            </div>}

            {step === 2 && <div className="space-y-4">
              <section className="rounded-2xl bg-white p-4"><h3 className="mb-3 text-sm font-black text-ink">Data pemesan</h3><div className="space-y-4">
                <label className="block text-sm font-bold text-ink">Nama pembeli<span className="ml-1 text-rose-deep">*</span><input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Nama panggilanmu" maxLength={80} autoComplete="name" aria-invalid={bad(!nameOk)} className={`${inputCls} ${bad(!nameOk) ? "!border-rose-deep" : ""}`} />{bad(!nameOk) && <span role="alert" className="mt-1 block text-xs font-bold text-rose-deep">Nama wajib diisi.</span>}</label>
                <label className="block text-sm font-bold text-ink">Nomor WhatsApp<span className="ml-1 text-rose-deep">*</span><input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="08xx xxxx xxxx" inputMode="tel" autoComplete="tel" aria-invalid={bad(!phoneOk)} className={`${inputCls} ${bad(!phoneOk) ? "!border-rose-deep" : ""}`} />{bad(!phoneOk) ? <span role="alert" className="mt-1 block text-xs font-bold text-rose-deep">Masukkan nomor WhatsApp yang valid (10–15 digit).</span> : <span className="mt-1 block text-xs font-normal text-ink/45">Admin akan menghubungi lewat nomor ini.</span>}</label>
              </div></section>
              <section className="rounded-2xl bg-white p-4"><h3 className="mb-3 text-sm font-black text-ink">Metode pengambilan</h3><div className="space-y-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${pickupMethod === "pickup" ? "border-rose bg-blush" : "border-rose/15"}`}><input type="radio" name="pickup-method" checked={pickupMethod === "pickup"} onChange={() => setPickupMethod("pickup")} className="mt-1 accent-[#d86e91]" /><span><strong className="block text-ink">Pick-up langsung</strong><span className="text-xs text-ink/60">Universitas Katolik Widya Mandala Dinoyo</span></span></label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${pickupMethod === "delivery" ? "border-rose bg-blush" : "border-rose/15"}`}><input type="radio" name="pickup-method" checked={pickupMethod === "delivery"} onChange={() => setPickupMethod("delivery")} className="mt-1 accent-[#d86e91]" /><span><strong className="block text-ink">Delivery (diantar)</strong><span className="text-xs text-ink/60">Kami antar sesuai area operasional.</span></span><Truck size={17} className="ml-auto shrink-0 text-rose-deep" aria-hidden="true" /></label>
              </div>
              {pickupMethod === "delivery" && <><label className="mt-3 block text-sm font-bold text-ink">Alamat lengkap<span className="ml-1 text-rose-deep">*</span><textarea value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} rows={2} placeholder="Jalan, nomor rumah, patokan" aria-invalid={bad(!addressOk)} className={`mt-2 w-full resize-none rounded-xl border bg-cream px-4 py-3 text-sm outline-none focus:border-rose focus:ring-4 focus:ring-rose/10 ${bad(!addressOk) ? "border-rose-deep" : "border-rose/15"}`} />{bad(!addressOk) && <span role="alert" className="mt-1 block text-xs font-bold text-rose-deep">Alamat wajib diisi untuk delivery.</span>}</label><p className="mt-2 rounded-xl bg-butter/60 p-3 text-xs leading-5 text-ink/70">Pengiriman di luar area yang ditentukan akan dikenakan biaya ongkir (diinfokan admin via WhatsApp).</p></>}</section>
            </div>}

            {step === 3 && <div className="space-y-4">
              <div className="rounded-2xl bg-blush p-4 text-center"><p className="text-[11px] font-bold uppercase tracking-wider text-rose-deep">Nominal yang harus dibayar</p><p className="mt-1 text-3xl font-black text-ink">{rupiah(total)}</p><p className="mt-1 text-xs text-ink/60">{totalItems} item • Ready {formatReadyDate(readyDate)}</p></div>
              <section className="rounded-2xl bg-white p-4"><div className="flex items-start gap-2"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blush text-rose-deep"><ShoppingBag size={15} aria-hidden="true" /></div><div><h3 className="text-sm font-black text-ink">Pembayaran QRIS wajib di awal</h3><p className="mt-1 text-xs leading-5 text-ink/60">Pembayaran wajib dilakukan di awal melalui QRIS sebelum pesanan diproses.</p></div></div>
                <div className="relative mx-auto my-4 flex h-48 w-48 items-center justify-center overflow-hidden rounded-xl border border-rose/10 bg-cream p-2 text-center text-[10px] font-bold text-ink/45"><span className="leading-4">QRIS TOKO<br /><span className="font-normal">Ganti gambar di<br />/qris-toko.png</span></span><img src="/qris-toko.png" alt="QRIS pembayaran Milky Melt" className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] bg-white object-contain" onError={(e) => { e.currentTarget.style.display = "none" }} /></div>
                <ol className="space-y-1.5 text-xs leading-5 text-ink/70"><li><strong className="text-rose-deep">1.</strong> Scan QRIS melalui bank atau e-wallet.</li><li><strong className="text-rose-deep">2.</strong> Bayar sesuai nominal <strong className="text-ink">{rupiah(total)}</strong>.</li><li><strong className="text-rose-deep">3.</strong> Upload screenshot bukti pembayaran.</li></ol>
              </section>
              <section className="rounded-2xl bg-white p-4"><label className="block text-sm font-bold text-ink">Foto bukti pembayaran<span className="ml-1 text-rose-deep">*</span><span className={`mt-2 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed bg-blush px-4 text-sm font-bold text-rose-deep hover:bg-rose/10 ${bad(!paymentProof) ? "border-rose-deep" : "border-rose/30"}`}><Upload size={16} aria-hidden="true" /> {paymentProof ? "Ganti foto bukti" : "Pilih foto bukti"}<input type="file" accept="image/*" onChange={(e) => handleProofChange(e.target.files?.[0])} className="sr-only" /></span></label>{bad(!paymentProof) && <p role="alert" className="mt-2 text-xs font-bold text-rose-deep">Upload bukti pembayaran dulu ya.</p>}{paymentPreview && <img src={paymentPreview} alt="Preview bukti pembayaran QRIS" className="mt-3 max-h-48 w-full rounded-xl object-contain" />}</section>
            </div>}
          </div>

          <div className="shrink-0 border-t border-rose/10 bg-white px-5 pb-5 pt-3">
            {error && <p role="alert" className="mb-3 rounded-xl bg-blush px-3 py-2 text-center text-xs font-bold text-rose-deep">{error}</p>}
            <div className="flex items-center gap-3"><div className="mr-auto"><p className="text-[11px] font-semibold text-ink/50">Total</p><p className="text-lg font-black leading-tight text-ink">{rupiah(total)}</p></div>{step > 1 && <button type="button" onClick={goBack} disabled={submitting} className="min-h-12 rounded-full border border-rose/20 px-5 text-sm font-bold text-ink/70 hover:bg-blush disabled:opacity-40">Kembali</button>}<button type="button" onClick={goNext} disabled={submitting} className="flex min-h-12 items-center gap-2 rounded-full bg-rose px-6 text-sm font-bold text-white transition hover:bg-rose-deep disabled:opacity-50">{step < 3 ? <>Lanjut <ChevronRight size={16} aria-hidden="true" /></> : <><Check size={16} aria-hidden="true" /> {submitting ? "Mengirim..." : "Kirim pesanan"}</>}</button></div>
            <p className="mt-3 text-center text-[11px] leading-4 text-ink/45">{step === 3 ? "Pastikan nominal dan bukti pembayaran sudah sesuai." : "Data kamu aman dan hanya digunakan untuk memproses pesanan."}</p>
          </div>
        </div>
      </div>}

      {receipt && <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="success-title"><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-cream p-6 shadow-soft sm:rounded-[2rem] sm:p-8">
        <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-deep">Struk digital</p><h2 id="success-title" className="mt-1 font-sans text-3xl font-black text-ink">Pesanan diterima!</h2></div><div className="grid h-12 w-12 place-items-center rounded-full bg-mint text-[#317156]"><Check size={24} strokeWidth={3} /></div></div>
        <div className="mt-5 rounded-2xl bg-white p-4"><div className="flex justify-between text-xs text-ink/50"><span>Nomor Order</span><strong className="text-ink">{receipt.orderCode}</strong></div>
          <div className="mt-4 space-y-2 border-t border-rose/10 pt-3 text-sm">
            {selectedProducts.map((p) => <div key={p.id} className="flex justify-between gap-3 text-ink/70"><span>{p.name} × {cart[p.id]}</span><span className="font-bold text-ink">{rupiah(p.price * (cart[p.id] ?? 0))}</span></div>)}
            {addOn && <div className="flex justify-between text-ink/70"><span>{addOn.name}</span><span className="font-bold text-ink">{rupiah(addOn.price)}</span></div>}
            <div className="flex justify-between border-t border-rose/10 pt-3 font-black text-ink"><span>Total</span><span>{rupiah(receipt.total)}</span></div>
          </div></div>
        <div className="mt-4 rounded-2xl border border-rose/15 bg-blush p-4 text-sm"><p className="font-black text-ink">Ready: {formatReadyDate(fromISODate(receipt.readyDate))}</p><p className="mt-2 font-bold text-rose-deep">Menunggu Konfirmasi Pembayaran oleh Admin</p><p className="mt-1 text-xs leading-5 text-ink/60">Metode: {pickupMethod === "pickup" ? "Pick-up langsung di Universitas Katolik Widya Mandala Dinoyo" : "Delivery (Diantar)"}</p></div>
        <button type="button" onClick={finish} className="mt-6 min-h-12 w-full rounded-full bg-ink px-5 text-sm font-bold text-white hover:bg-rose-deep">Selesai</button>
      </div></div>}
    </main>
  )
}
