"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { useUser } from "@/app/context/UserContext"
import AuthGuard from "@/app/context/AuthGuard"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORY_DOT_HEX = {
  "PMJAY":                 "#1f2937",
  "Govt Employee":         "#10b981",
  "Provisional Employee":  "#34d399",
  "Pensioner A":           "#ef4444",
  "Pensioner B":           "#f87171",
  "Contributory General":  "#f59e0b",
  "Contributory Standard": "#fbbf24",
  "Contributory Private":  "#fcd34d",
  "CSS":                   "#8b5cf6",
  "GIA MR":                "#3b82f6",
  "GIA Non MR":            "#60a5fa",
  "Unknown":               "#d1d5db",
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "PMJAY",                label: "PMJAY",                color: "black"  },
  { value: "Govt Employee",        label: "Govt Employee",        color: "green"  },
  { value: "Provisional Employee", label: "Provisional Employee", color: "green"  },
  { value: "Pensioner A",          label: "Pensioner A",          color: "red"    },
  { value: "Pensioner B",          label: "Pensioner B",          color: "red"    },
  { value: "Contributory General", label: "Contributory General", color: "yellow" },
  { value: "Contributory Standard",label: "Contributory Standard",color: "yellow" },
  { value: "Contributory Private", label: "Contributory Private", color: "yellow" },
  { value: "CSS",                  label: "CSS",                  color: "purple" },
  { value: "GIA MR",               label: "GIA MR",               color: "blue"   },
  { value: "GIA Non MR",           label: "GIA Non MR",           color: "blue"   },
]

const CATEGORY_DOT = {
  black:  "bg-gray-800",
  green:  "bg-emerald-500",
  red:    "bg-red-500",
  yellow: "bg-amber-400",
  purple: "bg-purple-500",
  blue:   "bg-blue-500",
}

const CATEGORY_COLOR = {
  "PMJAY":                 "black",
  "Govt Employee":         "green",
  "Provisional Employee":  "green",
  "Pensioner A":           "red",
  "Pensioner B":           "red",
  "Contributory General":  "yellow",
  "Contributory Standard": "yellow",
  "Contributory Private":  "yellow",
  "CSS":                   "purple",
  "GIA MR":                "blue",
  "GIA Non MR":            "blue",
}

const STATUS_STYLES = {
  settled: { label: "Settled", class: "bg-emerald-100 text-emerald-700" },
  pending: { label: "Pending", class: "bg-red-100 text-red-600"         },
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatINR(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`
}

function formatDate(d) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function calcDays(start, end) {
  const s = new Date(start); s.setHours(0,0,0,0)
  const e = new Date(end);   e.setHours(0,0,0,0)
  return Math.max(Math.round((e - s) / 86400000), 1)
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, accent }) {
  const colorMap = {
    gray:  { dot: "bg-gray-400",    text: "text-gray-900"    },
    green: { dot: "bg-emerald-400", text: "text-emerald-600" },
    blue:  { dot: "bg-blue-400",    text: "text-blue-600"    },
  }
  const c = colorMap[color] || colorMap.gray
  return (
    <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm p-4 md:p-7 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-1.5 mb-3 md:mb-4">
        <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />
        <span className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest leading-tight truncate">{label}</span>
      </div>
      <p className={`text-2xl md:text-[36px] font-semibold tracking-tight leading-none ${accent ? c.text : "text-gray-900"} tabular-nums`}>
        {value}
      </p>
    </div>
  )
}

function ClaimCard({ claim, received, onViewDetails }) {
  const pending = claim !== null && received !== null ? claim - received : null
  return (
    <div
      onClick={onViewDetails}
      className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm p-4 md:p-6 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-center gap-1.5 mb-3">
        <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-amber-400" />
        <span className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest leading-tight">Claim</span>
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-[10px] text-gray-400 mb-0.5">Total Claimed</p>
          <p className="text-[18px] md:text-[22px] font-semibold text-gray-900 tabular-nums tracking-tight leading-none">
            {claim !== null ? formatINR(claim) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 mb-0.5">Received</p>
          <p className="text-[15px] md:text-[18px] font-semibold text-emerald-600 tabular-nums tracking-tight leading-none">
            {received !== null ? formatINR(received) : "—"}
          </p>
        </div>
        {pending !== null && pending > 0 && (
          <div>
            <p className="text-[10px] text-gray-400 mb-0.5">Pending</p>
            <p className="text-[13px] md:text-[15px] font-semibold text-amber-600 tabular-nums tracking-tight leading-none">
              {formatINR(pending)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function MasterDashboard() {
  const router = useRouter()
  const { user } = useUser()

  const [records, setRecords]         = useState([])
  const [rates, setRates]             = useState({ muhcs: 0, cabin: 0, deluxe: 0, bed: 0 })
  const [loading, setLoading]         = useState(true)
  const [paymentsList, setPaymentsList] = useState([])
  const [totalReceived, setTotalReceived] = useState(0)
  const [showPaymentsDetail, setShowPaymentsDetail] = useState(false)

  // Filters
  const [search, setSearch]           = useState("")
  const [catFilter, setCatFilter]     = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [monthFilter, setMonthFilter] = useState("all")
  const [yearFilter, setYearFilter]   = useState(new Date().getFullYear())

  // Edit modal
  const [editRecord, setEditRecord]   = useState(null)
  const [editReceived, setEditReceived] = useState("")
  const [editStatus, setEditStatus]   = useState("pending")
  const [editSaving, setEditSaving]   = useState(false)
  const [editError, setEditError]     = useState("")

  // Sort
  const [sortDir, setSortDir]         = useState("asc") // oldest discharged first

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/")
  }, [user])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)

    const { data: ratesData } = await supabase.from("rate_master").select("*")
    const muhcs      = ratesData?.find(r => r.description.toLowerCase().includes("muhcs"))?.amount || 0
    const cabin      = ratesData?.find(r => r.description.toLowerCase().includes("cabin"))?.amount || 0
    const bed        = ratesData?.find(r => r.description.toLowerCase().includes("bed"))?.amount || 0
    const deluxe= ratesData?.find(r => r.description.toLowerCase().includes("semi"))?.amount || 0
    const rateMap    = { muhcs, cabin, bed, deluxe }
    setRates(rateMap)

    const { data: admissions } = await supabase
      .from("admissions")
      .select(`
        id, admission_date, discharge_date, accommodation,
        status, total_bill_override, claim_received, claim_status,
        patients(full_name, category)
      `)
      .eq("status", "discharged")
      .order("discharge_date", { ascending: false })

    const admIds = (admissions || []).map(a => a.id)
    let balanceMap = {}

    if (admIds.length > 0) {
      const [{ data: lab }, { data: pharma }, { data: xray }, { data: counter }, { data: ecg }, { data: addons }] =
        await Promise.all([
          supabase.from("lab_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("pharma_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("xray_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("counter_entries").select("admission_id, amount, charge_type").in("admission_id", admIds),
          supabase.from("ecg_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("claim_addons").select("admission_id, amount").in("admission_id", admIds),
        ])

      admissions.forEach(a => {
        const days = calcDays(a.admission_date, a.discharge_date)
        const wardAddon = a.accommodation === "cabin" ? days * cabin
          : a.accommodation === "deluxe" ? days * deluxe : 0
        const addonsTotal = (addons || []).filter(e => e.admission_id === a.id).reduce((s, e) => s + Number(e.amount), 0)
        const claim = days * muhcs + wardAddon + addonsTotal

        const sum = (arr) => (arr || []).filter(e => e.admission_id === a.id).reduce((s, e) => s + Number(e.amount), 0)
        const miscRate = (a.accommodation === "cabin" || a.accommodation === "deluxe") ? 100 : 50
        const miscTotal = days * miscRate
        const counterNoMisc = (counter || []).filter(e => e.admission_id === a.id && e.charge_type !== "misc").reduce((s, e) => s + Number(e.amount), 0)
        const entriesTotal = sum(lab) + sum(pharma) + sum(xray) + counterNoMisc + sum(ecg) + miscTotal
        const hospitalBill = a.total_bill_override !== null && a.total_bill_override !== undefined
          ? Number(a.total_bill_override) : entriesTotal

        balanceMap[a.id] = { claim, hospitalBill, addonsTotal }
      })
    }

    const enriched = (admissions || []).map(a => ({
      ...a,
      ...balanceMap[a.id],
      received: Number(a.claim_received || 0),
      claimStatus: a.claim_status || "pending",
    }))

    setRecords(enriched)

    // Fetch payments
    const { data: payments } = await supabase.from("payments").select("amount, payment_date").order("payment_date", { ascending: false })
    const received = (payments || []).reduce((s, p) => s + Number(p.amount), 0)
    setTotalReceived(received)
    setPaymentsList(payments || [])

    setLoading(false)
  }

  // ── Derived filter state ──
  const months = ["All", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const now = new Date()
  const yearOptions = []
  for (let y = 2024; y <= now.getFullYear(); y++) yearOptions.push(y)

  const filtered = useMemo(() => {
    return records
      .filter(r => {
        if (search && !r.patients?.full_name?.toLowerCase().includes(search.toLowerCase())) return false
        if (catFilter !== "all" && r.patients?.category !== catFilter) return false
        if (statusFilter !== "all" && r.claimStatus !== statusFilter) return false
        if (monthFilter !== "all") {
          const d = new Date(r.discharge_date)
          if (d.getMonth() !== Number(monthFilter)) return false
        }
        const d = new Date(r.discharge_date)
        if (d.getFullYear() !== yearFilter) return false
        return true
      })
      .sort((a, b) => {
        const da = new Date(a.discharge_date)
        const db = new Date(b.discharge_date)
        return sortDir === "asc" ? da - db : db - da
      })
  }, [records, search, catFilter, statusFilter, monthFilter, yearFilter, sortDir])

  // ── Summary stats ──
  const totalClaim       = filtered.reduce((s, r) => s + (r.claim || 0), 0)
  const totalClaimPaid   = filtered.reduce((s, r) => s + r.received, 0)
  const totalPending     = totalClaim - totalClaimPaid
  const countSettled     = filtered.filter(r => r.claimStatus === "settled").length
  const countPending     = filtered.filter(r => r.claimStatus === "pending").length
  // Unfiltered totals for stat cards (always show full picture)
  const grandTotalClaim    = records.reduce((s, r) => s + (r.claim || 0), 0)
  const grandSettledAmount = records.filter(r => r.claimStatus === "settled").reduce((s, r) => s + (r.claim || 0), 0)
  const grandPendingAmount = records.filter(r => r.claimStatus === "pending").reduce((s, r) => s + (r.claim || 0), 0)
  const grandCountSettled  = records.filter(r => r.claimStatus === "settled").length
  const grandCountPending  = records.filter(r => r.claimStatus === "pending").length

  // ── Edit handlers ──
  function openEdit(record) {
    setEditRecord(record)
    setEditReceived(record.received > 0 ? record.received.toString() : "")
    setEditStatus(record.claimStatus)
    setEditError("")
  }

  async function saveEdit() {
    if (!editRecord) return
    const amount = editReceived === "" ? null : Number(editReceived)
    if (amount !== null && isNaN(amount)) { setEditError("Enter a valid amount."); return }

    setEditSaving(true)
    const { error } = await supabase
      .from("admissions")
      .update({ claim_received: amount, claim_status: editStatus })
      .eq("id", editRecord.id)

    if (error) { setEditError(error.message); setEditSaving(false); return }

    setRecords(prev => prev.map(r =>
      r.id === editRecord.id
        ? { ...r, received: amount || 0, claim_received: amount, claimStatus: editStatus, claim_status: editStatus }
        : r
    ))
    setEditSaving(false)
    setEditRecord(null)
  }

  return (
    <AuthGuard>
    <div className="min-h-screen bg-[#f5f5f7]">

      {/* Payments detail modal */}
      {showPaymentsDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowPaymentsDetail(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[17px] font-semibold text-gray-900">Payments Received</h2>
              <button onClick={() => setShowPaymentsDetail(false)} className="text-gray-400 hover:text-gray-700 transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            {paymentsList.length === 0 ? (
              <p className="text-[14px] text-gray-400 text-center py-6">No payments recorded yet.</p>
            ) : (
              <div className="space-y-0 divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {paymentsList.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-3">
                    <p className="text-[13px] text-gray-500">{formatDate(p.payment_date)}</p>
                    <p className="text-[14px] font-semibold text-emerald-600 tabular-nums">{formatINR(p.amount)}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest">Total</p>
              <p className="text-[16px] font-semibold text-emerald-600 tabular-nums">{formatINR(totalReceived)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setEditRecord(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h2 className="text-[17px] font-semibold text-gray-900">{editRecord.patients?.full_name}</h2>
              <p className="text-[12px] text-gray-400 mt-0.5">Claim: {formatINR(editRecord.claim)}</p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Amount Received</label>
              <input
                type="number"
                value={editReceived}
                onChange={e => setEditReceived(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {["pending","settled"].map(s => (
                  <button
                    key={s}
                    onClick={() => setEditStatus(s)}
                    className={`py-2.5 rounded-xl text-[13px] font-semibold capitalize border-2 transition ${
                      editStatus === s
                        ? s === "settled" ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-red-500 bg-red-500 text-white"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >{STATUS_STYLES[s].label}</button>
                ))}
              </div>
            </div>

            {editError && <p className="text-[12px] text-red-500">{editError}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditRecord(null)}
                className="flex-1 py-2.5 text-[13px] font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
              >Cancel</button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="flex-1 py-2.5 text-[13px] font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 rounded-xl transition"
              >{editSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-black/[0.06] px-5 md:px-14 py-4 md:py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition shadow-sm"
            >
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
                <path d="M6 1L1 6l5 5" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">Admin</p>
              <h1 className="text-[18px] md:text-[22px] font-semibold text-gray-900 tracking-tight leading-none">Master Dashboard</h1>
            </div>
          </div>
          <div className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-gray-900 flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{user?.name?.slice(0,2).toUpperCase()}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 md:px-14 py-8 md:py-10 space-y-6">

        {/* Stat cards — same as main dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          <StatCard label="Total Patients" value={loading ? "—" : records.length} color="gray" />
          <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm p-4 md:p-6">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Settled</p>
            </div>
            <p className="text-[18px] md:text-[22px] font-semibold text-emerald-600 tabular-nums tracking-tight leading-none">{loading ? "—" : formatINR(grandSettledAmount)}</p>
            <p className="text-[11px] text-gray-400 mt-1.5">{grandCountSettled} patients</p>
          </div>
          <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm p-4 md:p-6">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Pending</p>
            </div>
            <p className="text-[18px] md:text-[22px] font-semibold text-red-500 tabular-nums tracking-tight leading-none">{loading ? "—" : formatINR(grandPendingAmount)}</p>
            <p className="text-[11px] text-gray-400 mt-1.5">{grandCountPending} patients</p>
          </div>
          <ClaimCard
            claim={loading ? null : grandTotalClaim}
            received={loading ? null : totalReceived}
            onViewDetails={() => setShowPaymentsDetail(true)}
          />
        </div>

        {/* Collection Progress Bar */}
        {!loading && grandTotalClaim > 0 && (() => {
          const settledPct = Math.round((grandSettledAmount / grandTotalClaim) * 100)
          const pendingPct = 100 - settledPct
          return (
            <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Collection Progress</p>
                <p className="text-[12px] font-semibold text-gray-500 tabular-nums">{settledPct}% settled</p>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500 rounded-l-full transition-all duration-700"
                  style={{ width: `${settledPct}%` }}
                />
                <div
                  className="h-full bg-red-400 rounded-r-full transition-all duration-700"
                  style={{ width: `${pendingPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[11px] text-gray-500">Settled <span className="font-semibold text-emerald-600">{formatINR(grandSettledAmount)}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    <span className="text-[11px] text-gray-500">Pending <span className="font-semibold text-red-500">{formatINR(grandPendingAmount)}</span></span>
                  </div>
                </div>
                <span className="text-[11px] text-gray-400 tabular-nums">{formatINR(grandTotalClaim)} total</span>
              </div>
            </div>
          )
        })()}

        {/* Charts row */}
        {!loading && records.length > 0 && (() => {
          // Monthly settled vs pending bar data
          const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
          const monthlyMap = {}
          records.forEach(r => {
            if (!r.discharge_date) return
            const d = new Date(r.discharge_date)
            const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2,"0")}`
            const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`
            if (!monthlyMap[key]) monthlyMap[key] = { name: label, settled: 0, pending: 0 }
            if (r.claimStatus === "settled") monthlyMap[key].settled += r.claim || 0
            else monthlyMap[key].pending += r.claim || 0
          })
          const monthlyChartData = Object.entries(monthlyMap)
            .sort(([a],[b]) => a.localeCompare(b))
            .map(([,v]) => v)

          // Category pending donut
          const catMap = {}
          records.filter(r => r.claimStatus === "pending").forEach(r => {
            const cat = r.patients?.category || "Unknown"
            catMap[cat] = (catMap[cat] || 0) + (r.claim || 0)
          })
          const catTotal = Object.values(catMap).reduce((s, v) => s + v, 0)
          const catData = Object.entries(catMap)
            .map(([name, value]) => ({
              name, value,
              color: CATEGORY_DOT_HEX[name] || "#d1d5db",
              pct: catTotal > 0 ? ((value / catTotal) * 100).toFixed(1) : "0"
            }))
            .sort((a, b) => b.value - a.value)

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Bar chart — settled vs pending by month */}
              <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5 md:py-6">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Monthly Settlement</p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"/><span className="text-[10px] text-gray-400">Settled</span></div>
                  <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400"/><span className="text-[10px] text-gray-400">Pending</span></div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyChartData} barGap={2} barCategoryGap="25%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false}
                      tickFormatter={v => v.split(" ")[0]} />
                    <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        const s = payload.find(p => p.dataKey === "settled")?.value || 0
                        const p = payload.find(p => p.dataKey === "pending")?.value || 0
                        return (
                          <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-[12px]">
                            <p className="font-semibold text-gray-900 mb-1">{label}</p>
                            <p className="text-emerald-600">Settled: {formatINR(s)}</p>
                            <p className="text-red-500">Pending: {formatINR(p)}</p>
                          </div>
                        )
                      }}
                      cursor={{ fill: "#f9fafb" }}
                    />
                    <Bar dataKey="settled" fill="#10b981" radius={[4,4,0,0]} />
                    <Bar dataKey="pending" fill="#f87171" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Donut — pending by category */}
              <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5 md:py-6">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Pending by Category</p>
                <p className="text-[11px] text-gray-300 mb-4">Outstanding claim amount per category</p>
                {catData.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-emerald-500 text-[13px] font-medium">All claims settled! 🎉</div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={catData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2} dataKey="value" strokeWidth={0}>
                          {catData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-[12px]">
                              <p className="font-semibold text-gray-900">{payload[0].name}</p>
                              <p style={{ color: payload[0].payload.color }}>{formatINR(payload[0].value)}</p>
                              <p className="text-gray-400">{payload[0].payload.pct}% of pending</p>
                            </div>
                          )
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="w-full grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {catData.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-[11px] text-gray-600 truncate flex-1">{d.name}</span>
                          <span className="text-[11px] font-semibold text-gray-500 tabular-nums">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Category pending breakdown */}
        <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Pending by Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => {
              const catPending = filtered.filter(r =>
                r.patients?.category === c.value && r.claimStatus === "pending"
              ).length
              if (catPending === 0) return null
              return (
                <button
                  key={c.value}
                  onClick={() => { setCatFilter(c.value); setStatusFilter("all") }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition"
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${CATEGORY_DOT[c.color]}`} />
                  <span className="text-[12px] font-medium text-gray-700">{c.label}</span>
                  <span className="text-[11px] font-semibold text-red-500 tabular-nums">{catPending} pending</span>
                </button>
              )
            })}
            {filtered.length > 0 && CATEGORIES.every(c => filtered.filter(r => r.patients?.category === c.value && r.claimStatus === "pending").length === 0) && (
              <p className="text-[13px] text-emerald-600 font-medium">All claims settled! 🎉</p>
            )}
            {filtered.length === 0 && (
              <p className="text-[13px] text-gray-400">No records match current filters.</p>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5 space-y-4">

          {/* Search + year/month */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder="Search patient name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition"
              />
            </div>
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="text-[13px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition"
            >
              <option value="all">All Months</option>
              {months.slice(1).map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(Number(e.target.value))}
              className="text-[13px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap gap-2">
            {[
              { value: "all",     label: "All",     count: records.length },
              { value: "pending", label: "Pending", count: records.filter(r => r.claimStatus === "pending").length },
              { value: "settled", label: "Settled", count: records.filter(r => r.claimStatus === "settled").length },
            ].map(s => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition ${
                  statusFilter === s.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {s.label}
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${statusFilter === s.value ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"}`}>{s.count}</span>
              </button>
            ))}
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {(() => {
              const allCount = records.filter(r => {
                if (statusFilter !== "all" && r.claimStatus !== statusFilter) return false
                return true
              }).length
              return (
                <button
                  onClick={() => setCatFilter("all")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition ${catFilter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  All
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${catFilter === "all" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"}`}>{allCount}</span>
                </button>
              )
            })()}
            {CATEGORIES.map(c => {
              const count = records.filter(r => {
                if (r.patients?.category !== c.value) return false
                if (statusFilter !== "all" && r.claimStatus !== statusFilter) return false
                return true
              }).length
              if (count === 0) return null
              return (
                <button
                  key={c.value}
                  onClick={() => setCatFilter(c.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition ${
                    catFilter === c.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${CATEGORY_DOT[c.color]}`} />
                  {c.label}
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${catFilter === c.value ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden">
          {/* Table header with sort */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-6 md:px-8 pt-5 pb-3">
              <p className="text-[12px] text-gray-400 tabular-nums">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>
              <button
                onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-95 px-3 py-1.5 rounded-full transition"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  {sortDir === "asc"
                    ? <path d="M12 5l7 14H5L12 5z" fill="currentColor"/>
                    : <path d="M12 19L5 5h14L12 19z" fill="currentColor"/>
                  }
                </svg>
                DOD {sortDir === "asc" ? "Oldest first" : "Newest first"}
              </button>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-[14px]">No records found.</div>
          ) : (
            <>
              {/* Desktop */}
              <table className="hidden md:table w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["#","Patient","Category","DOD","Ward","Hospital Bill","MUHCS Claim","Received","Pending","Status"].map(h => (
                      <th key={h} className="px-4 py-4 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap first:pl-6 last:pr-6">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((r, idx) => {
                    const pending = (r.claim || 0) - r.received
                    const catColor = CATEGORY_COLOR[r.patients?.category]
                    const dotColor = catColor ? CATEGORY_DOT[catColor] : null
                    const s = STATUS_STYLES[r.claimStatus] || STATUS_STYLES.pending
                    return (
                      <tr
                        key={r.id}
                        onClick={() => openEdit(r)}
                        className="hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
                      >
                        <td className="pl-6 pr-2 py-4 text-[12px] font-semibold text-gray-300 tabular-nums">{idx + 1}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {dotColor && <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />}
                            <span className="font-medium text-gray-900">{r.patients?.full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-500">{r.patients?.category || "—"}</td>
                        <td className="px-4 py-4 text-gray-500 whitespace-nowrap">{formatDate(r.discharge_date)}</td>
                        <td className="px-4 py-4 text-gray-500 capitalize whitespace-nowrap">
                          {r.accommodation === "deluxe" ? "Deluxe" : r.accommodation === "pedia" ? "Pedia" : r.accommodation}
                        </td>
                        <td className="px-4 py-4 tabular-nums text-gray-700">{formatINR(r.hospitalBill)}</td>
                        <td className="px-4 py-4 tabular-nums font-semibold text-gray-900">{formatINR(r.claim)}</td>
                        <td className="px-4 py-4 tabular-nums text-emerald-600 font-semibold">{r.received > 0 ? formatINR(r.received) : "—"}</td>
                        <td className={`px-4 py-4 tabular-nums font-semibold ${pending > 0 ? "text-red-500" : "text-gray-400"}`}>
                          {pending > 0 ? formatINR(pending) : "—"}
                        </td>
                        <td className="px-4 py-4 pr-6">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${s.class}`}>{s.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-gray-50">
                {filtered.map((r, idx) => {
                  const pending = (r.claim || 0) - r.received
                  const catColor = CATEGORY_COLOR[r.patients?.category]
                  const dotColor = catColor ? CATEGORY_DOT[catColor] : null
                  const s = STATUS_STYLES[r.claimStatus] || STATUS_STYLES.pending
                  return (
                    <div
                      key={r.id}
                      onClick={() => openEdit(r)}
                      className="px-5 py-4 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-[12px] font-semibold text-gray-300 tabular-nums pt-0.5 w-5 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {dotColor && <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />}
                              <p className="font-semibold text-[15px] text-gray-900 truncate">{r.patients?.full_name}</p>
                            </div>
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${s.class}`}>{s.label}</span>
                          </div>
                          <p className="text-[12px] text-gray-400 mt-0.5">
                            {r.patients?.category || "—"} · {formatDate(r.discharge_date)}
                          </p>
                          <div className="flex items-center gap-4 mt-2">
                            <div>
                              <p className="text-[10px] text-gray-400">Claim</p>
                              <p className="text-[13px] font-semibold text-gray-900 tabular-nums">{formatINR(r.claim)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400">Received</p>
                              <p className="text-[13px] font-semibold text-emerald-600 tabular-nums">{r.received > 0 ? formatINR(r.received) : "—"}</p>
                            </div>
                            {pending > 0 && (
                              <div>
                                <p className="text-[10px] text-gray-400">Pending</p>
                                <p className="text-[13px] font-semibold text-red-500 tabular-nums">{formatINR(pending)}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

        </div>

      </main>
    </div>
    </AuthGuard>
  )
}