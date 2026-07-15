"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { useUser } from "@/app/context/UserContext"
import AuthGuard from "@/app/context/AuthGuard"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie
} from "recharts"

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const CATEGORIES = [
  { value: "PMJAY",                 color: "#1f2937" },
  { value: "Govt Employee",         color: "#10b981" },
  { value: "Provisional Employee",  color: "#34d399" },
  { value: "Pensioner A",           color: "#ef4444" },
  { value: "Pensioner B",           color: "#f87171" },
  { value: "Contributory General",  color: "#f59e0b" },
  { value: "Contributory Standard", color: "#fbbf24" },
  { value: "Contributory Private",  color: "#fcd34d" },
  { value: "CSS",                   color: "#8b5cf6" },
  { value: "GIA MR",                color: "#3b82f6" },
  { value: "GIA Non MR",            color: "#60a5fa" },
  { value: "Unknown",               color: "#d1d5db" },
]

function formatINR(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`
}

function calcDays(start, end) {
  if (!end) return 1
  const s = new Date(start); s.setHours(0,0,0,0)
  const e = new Date(end);   e.setHours(0,0,0,0)
  return Math.max(Math.round((e - s) / 86400000), 1)
}

function BarTooltip({ active, payload, label, isAdmin }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-[13px]">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      <p className="text-emerald-600">{formatINR(payload[0]?.value)} claim</p>
      {isAdmin && payload[1] && <p className="text-gray-400">{formatINR(payload[1]?.value)} billed</p>}
    </div>
  )
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-[13px]">
      <p className="font-semibold text-gray-900">{payload[0].name}</p>
      <p style={{ color: payload[0].payload.color }}>{formatINR(payload[0].value)}</p>
      <p className="text-gray-400">{payload[0].payload.pct}% of total</p>
    </div>
  )
}

export default function SummaryPage() {
  const router  = useRouter()
  const { user } = useUser()
  const isAdmin = user?.role === "admin"

  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [records, setRecords] = useState([])
  const [rates, setRates]     = useState({ muhcs: 0, cabin: 0, deluxe: 0 })
  const [loading, setLoading] = useState(true)

  const yearOptions = []
  for (let y = 2024; y <= now.getFullYear(); y++) yearOptions.push(y)

  useEffect(() => { fetchAll() }, [year])

  async function fetchAll() {
    setLoading(true)

    const { data: ratesData } = await supabase.from("rate_master").select("*")
    const muhcs  = ratesData?.find(r => r.description.toLowerCase().includes("muhcs"))?.amount || 0
    const cabin  = ratesData?.find(r => r.description.toLowerCase().includes("cabin"))?.amount || 0
    const deluxe = ratesData?.find(r => r.description.toLowerCase().includes("deluxe") || r.description.toLowerCase().includes("semi"))?.amount || 0
    setRates({ muhcs, cabin, deluxe })

    const { data: admissions } = await supabase
      .from("admissions")
      .select(`id, admission_date, discharge_date, accommodation, status, total_bill_override, patients(full_name, category)`)
      .eq("status", "discharged")

    const admIds = (admissions || []).map(a => a.id)
    const addonsMap = {}
    const entriesMap = {}

    if (admIds.length > 0) {
      const [{ data: addons }, { data: lab }, { data: pharma }, { data: xray }, { data: counter }, { data: ecg }] =
        await Promise.all([
          supabase.from("claim_addons").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("lab_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("pharma_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("xray_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("counter_entries").select("admission_id, amount, charge_type").in("admission_id", admIds),
          supabase.from("ecg_entries").select("admission_id, amount").in("admission_id", admIds),
        ])

      ;(addons || []).forEach(a => {
        addonsMap[a.admission_id] = (addonsMap[a.admission_id] || 0) + Number(a.amount)
      })

      admissions.forEach(a => {
        const sum = (arr) => (arr || []).filter(e => e.admission_id === a.id).reduce((s, e) => s + Number(e.amount), 0)
        const miscRate = (a.accommodation === "cabin" || a.accommodation === "deluxe") ? 100 : 50
        const days = calcDays(a.admission_date, a.discharge_date)
        const counterNoMisc = (counter || []).filter(e => e.admission_id === a.id && e.charge_type !== "misc").reduce((s, e) => s + Number(e.amount), 0)
        entriesMap[a.id] = sum(lab) + sum(pharma) + sum(xray) + counterNoMisc + sum(ecg) + days * miscRate
      })
    }

    const enriched = (admissions || []).map(a => {
      const days      = calcDays(a.admission_date, a.discharge_date)
      const wardAddon = a.accommodation === "cabin" ? days * cabin
        : a.accommodation === "deluxe" ? days * deluxe : 0
      const claim     = days * muhcs + wardAddon + (addonsMap[a.id] || 0)
      const billed    = a.total_bill_override !== null && a.total_bill_override !== undefined
        ? Number(a.total_bill_override) : (entriesMap[a.id] || 0)
      const dod       = new Date(a.discharge_date)
      return { ...a, claim, billed, dodYear: dod.getFullYear(), dodMonth: dod.getMonth() }
    })

    setRecords(enriched)
    setLoading(false)
  }

  const yearRecords = useMemo(() =>
    records.filter(r => r.dodYear === year), [records, year])

  const monthlyData = useMemo(() =>
    MONTH_NAMES.map((name, i) => {
      const m = yearRecords.filter(r => r.dodMonth === i)
      return { name, claim: m.reduce((s, r) => s + r.claim, 0), billed: m.reduce((s, r) => s + r.billed, 0), count: m.length }
    }).filter(m => m.count > 0), [yearRecords])

  const donutData = useMemo(() => {
    const catMap = {}
    yearRecords.forEach(r => {
      const cat = r.patients?.category || "Unknown"
      catMap[cat] = (catMap[cat] || 0) + r.claim
    })
    const total = Object.values(catMap).reduce((s, v) => s + v, 0)
    return Object.entries(catMap)
      .map(([name, value]) => ({
        name, value,
        color: CATEGORIES.find(c => c.value === name)?.color || "#d1d5db",
        pct: total > 0 ? ((value / total) * 100).toFixed(1) : "0",
      }))
      .sort((a, b) => b.value - a.value)
  }, [yearRecords])

  const yearClaim  = yearRecords.reduce((s, r) => s + r.claim, 0)
  const yearBilled = yearRecords.reduce((s, r) => s + r.billed, 0)
  const yearCount  = yearRecords.length

  return (
    <AuthGuard>
    <div className="min-h-screen bg-[#f5f5f7]">

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
              <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">Analytics</p>
              <h1 className="text-[18px] md:text-[22px] font-semibold text-gray-900 tracking-tight leading-none">Monthly Summary</h1>
            </div>
          </div>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10 transition shadow-sm"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 md:px-14 py-8 md:py-10 space-y-6">

        {/* Year stat cards */}
        <div className={`grid gap-4 ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
          <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm p-4 md:p-6">
            <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Discharged</p>
            <p className="text-[24px] md:text-[32px] font-semibold text-gray-900 tabular-nums tracking-tight leading-none">{loading ? "—" : yearCount}</p>
            <p className="text-[11px] text-gray-400 mt-1.5">patients in {year}</p>
          </div>
          {isAdmin && (
            <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm p-4 md:p-6">
              <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Total Billed</p>
              <p className="text-[24px] md:text-[32px] font-semibold text-gray-900 tabular-nums tracking-tight leading-none">{loading ? "—" : formatINR(yearBilled)}</p>
              <p className="text-[11px] text-gray-400 mt-1.5">hospital bill {year}</p>
            </div>
          )}
          <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm p-4 md:p-6">
            <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">MUHCS Claim</p>
            <p className="text-[24px] md:text-[32px] font-semibold text-emerald-600 tabular-nums tracking-tight leading-none">{loading ? "—" : formatINR(yearClaim)}</p>
            <p className="text-[11px] text-gray-400 mt-1.5">total claimed {year}</p>
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Bar chart */}
          <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5 md:py-6">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Claim per Month</p>
            <p className="text-[11px] text-gray-300 mb-5">
              {isAdmin ? "Green = Claim · Grey = Billed" : "MUHCS Claim by discharge month"}
            </p>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
              </div>
            ) : monthlyData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-300 text-[13px]">No data for {year}</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData} barGap={2} barCategoryGap="30%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={v => `₹${(v/1000).toFixed(0)}k`}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false} tickLine={false} width={52}
                  />
                  <Tooltip content={<BarTooltip isAdmin={isAdmin} />} cursor={{ fill: "#f9fafb" }} />
                  {isAdmin && <Bar dataKey="billed" fill="#e5e7eb" radius={[4,4,0,0]} />}
                  <Bar dataKey="claim" fill="#10b981" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Donut chart */}
          <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5 md:py-6">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Claim by Category</p>
            <p className="text-[11px] text-gray-300 mb-5">MUHCS claim amount per beneficiary category</p>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
              </div>
            ) : donutData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-300 text-[13px]">No data for {year}</div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="shrink-0" style={{ width: 180, height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%" cy="50%"
                        innerRadius={52} outerRadius={82}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<DonutTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  {donutData.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
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

        {/* Monthly table */}
        <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden">
          <div className="px-5 md:px-7 py-5 border-b border-gray-50">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Month by Month</p>
          </div>
          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="px-5 md:px-7 py-4 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Month</th>
                  <th className="px-5 md:px-7 py-4 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Discharged</th>
                  {isAdmin && <th className="px-5 md:px-7 py-4 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Total Billed</th>}
                  <th className="px-5 md:px-7 py-4 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">MUHCS Claim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {MONTH_NAMES.map((name, i) => {
                  const m = yearRecords.filter(r => r.dodMonth === i)
                  if (m.length === 0) return null
                  const mClaim  = m.reduce((s, r) => s + r.claim, 0)
                  const mBilled = m.reduce((s, r) => s + r.billed, 0)
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 md:px-7 py-4 font-medium text-gray-900">{name} {year}</td>
                      <td className="px-5 md:px-7 py-4 text-gray-500 tabular-nums">{m.length}</td>
                      {isAdmin && <td className="px-5 md:px-7 py-4 text-gray-500 tabular-nums">{formatINR(mBilled)}</td>}
                      <td className="px-5 md:px-7 py-4 font-semibold text-emerald-600 tabular-nums">{formatINR(mClaim)}</td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-5 md:px-7 py-4 font-semibold text-gray-900">Total {year}</td>
                  <td className="px-5 md:px-7 py-4 font-semibold text-gray-900 tabular-nums">{yearCount}</td>
                  {isAdmin && <td className="px-5 md:px-7 py-4 font-semibold text-gray-900 tabular-nums">{formatINR(yearBilled)}</td>}
                  <td className="px-5 md:px-7 py-4 font-semibold text-emerald-600 tabular-nums">{formatINR(yearClaim)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

      </main>
    </div>
    </AuthGuard>
  )
}