"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { useUser } from "@/app/context/UserContext"
import AuthGuard from "@/app/context/AuthGuard"

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"]

const WARDS = [
  { value: "general",    label: "General"    },
  { value: "pedia",      label: "Pedia"      },
  { value: "semi_cabin", label: "Semi Cabin" },
  { value: "cabin",      label: "Cabin"      },
  { value: "deluxe",     label: "Deluxe"     },
]

function formatINR(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`
}

// diff = Claim − Billed  →  "+" = surplus, "−" = loss
function formatDiff(n) {
  if (!n) return "—"
  return `${n > 0 ? "+" : "−"}${formatINR(Math.abs(n))}`
}

function shortDate(str) {
  if (!str) return "—"
  const [y, m, d] = str.split("T")[0].split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

const CATEGORY_DOT = {
  "PMJAY": "bg-gray-800",
  "Govt Employee": "bg-emerald-500", "Provisional Employee": "bg-emerald-500",
  "Pensioner A": "bg-red-500", "Pensioner B": "bg-red-500",
  "Contributory General": "bg-amber-400", "Contributory Standard": "bg-amber-400", "Contributory Private": "bg-amber-400",
  "CSS": "bg-purple-500",
  "GIA MR": "bg-blue-500", "GIA Non MR": "bg-blue-500",
}

function calcDays(start, end) {
  if (!end) return 1
  const [sy, sm, sd] = start.split("T")[0].split("-").map(Number)
  const [ey, em, ed] = end.split("T")[0].split("-").map(Number)
  return Math.max(Math.round((new Date(ey, em - 1, ed) - new Date(sy, sm - 1, sd)) / 86400000), 1)
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const router = useRouter()
  const { user } = useUser()
  const isAdmin = user?.role === "admin"

  const now = new Date()
  const [month, setMonth]     = useState(now.getMonth())
  const [year, setYear]       = useState(now.getFullYear())
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const yearOptions = []
  for (let y = 2024; y <= now.getFullYear(); y++) yearOptions.push(y)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)

    const { data: ratesData } = await supabase.from("rate_master").select("*")
    const find = fn => ratesData?.find(r => fn(r.description.toLowerCase()))?.amount || 0
    const muhcs     = find(d => d.includes("muhcs"))
    const cabin     = find(d => d.includes("cabin") && !d.includes("semi"))
    const deluxe    = find(d => d.includes("deluxe"))
    const semiCabin = find(d => d.includes("semi"))

    const { data: admissions } = await supabase
      .from("admissions")
      .select("id, admission_date, discharge_date, accommodation, total_bill_override, patients(full_name, category)")
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
        const sum = arr => (arr || []).filter(e => e.admission_id === a.id).reduce((s, e) => s + Number(e.amount), 0)
        const days = calcDays(a.admission_date, a.discharge_date)
        const counterNoMisc = (counter || [])
          .filter(e => e.admission_id === a.id && e.charge_type !== "misc")
          .reduce((s, e) => s + Number(e.amount), 0)
        entriesMap[a.id] = sum(lab) + sum(pharma) + sum(xray) + counterNoMisc + sum(ecg) + days * 50
      })
    }

    const enriched = (admissions || []).map(a => {
      const days = calcDays(a.admission_date, a.discharge_date)
      const wardAddon =
        a.accommodation === "cabin"      ? days * cabin :
        a.accommodation === "deluxe"     ? days * deluxe :
        a.accommodation === "semi_cabin" ? days * semiCabin : 0
      const claim  = days * muhcs + wardAddon + (addonsMap[a.id] || 0)
      const billed = a.total_bill_override !== null && a.total_bill_override !== undefined
        ? Number(a.total_bill_override) : (entriesMap[a.id] || 0)
      const [y, m] = a.discharge_date.split("T")[0].split("-").map(Number)
      return {
        id: a.id, ward: a.accommodation, claim, billed, days,
        name: a.patients?.full_name || "—",
        category: a.patients?.category || "",
        doa: a.admission_date, dod: a.discharge_date,
        dodYear: y, dodMonth: m - 1,
      }
    })

    setRecords(enriched)
    setLoading(false)
  }

  const monthRecords = useMemo(
    () => records.filter(r => r.dodYear === year && r.dodMonth === month),
    [records, year, month]
  )

  const wardRows = useMemo(() => WARDS.map(w => {
    const recs = monthRecords.filter(r => r.ward === w.value)
    const claim  = recs.reduce((s, r) => s + r.claim, 0)
    const billed = recs.reduce((s, r) => s + r.billed, 0)
    return { ...w, count: recs.length, claim, billed, diff: claim - billed }
  }), [monthRecords])

  const totals = useMemo(() => {
    const claim  = wardRows.reduce((s, r) => s + r.claim, 0)
    const billed = wardRows.reduce((s, r) => s + r.billed, 0)
    return { count: monthRecords.length, claim, billed, diff: claim - billed }
  }, [wardRows, monthRecords])

  const patientsByWard = useMemo(() => {
    const map = {}
    ;[...monthRecords]
      .sort((a, b) => a.dod.localeCompare(b.dod) || a.name.localeCompare(b.name))
      .forEach(r => { (map[r.ward] = map[r.ward] || []).push(r) })
    return map
  }, [monthRecords])

  const generatedOn = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  const title = `${MONTH_FULL[month]} ${year}`

  const thClass = "px-3 md:px-5 py-3 text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest"

  return (
    <AuthGuard>
    <style>{`
      @media print {
        @page { size: A4; margin: 14mm; }
        body { background: #fff !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>
    <div className="min-h-screen bg-[#f5f5f7] print:bg-white">

      {/* Controls — hidden when printing */}
      <header className="print:hidden sticky top-0 z-10 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-black/[0.06] px-5 md:px-14 py-4">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition shadow-sm"
            >
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
                <path d="M6 1L1 6l5 5" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <h1 className="text-[18px] font-semibold text-gray-900 tracking-tight">Monthly Report</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10 shadow-sm"
            >
              {MONTH_FULL.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10 shadow-sm"
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 active:scale-95 text-white text-[13px] font-medium px-4 py-2 rounded-xl transition"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v7H6v-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Print / PDF
            </button>
          </div>
        </div>
      </header>

      {/* Report sheet */}
      <main className="max-w-4xl mx-auto px-5 md:px-14 py-8 print:p-0 print:max-w-none">
        <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm print:shadow-none print:border-0 print:rounded-none px-5 md:px-10 py-7 md:py-10 space-y-8">

          {/* Report header */}
          <div className="flex items-center justify-between gap-4 pb-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <img src="/logo.jpg" alt="Mercy Hospital" className="h-12 w-12 md:h-14 md:w-14 rounded-full object-cover shrink-0" />
              <div>
                <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase leading-none mb-1">Mercy Hospital · MUHCS</p>
                <h2 className="text-[18px] md:text-[22px] font-semibold text-gray-900 tracking-tight leading-none">Monthly Ward Report</h2>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[15px] md:text-[18px] font-semibold text-gray-900 leading-none">{title}</p>
              <p className="text-[11px] text-gray-400 mt-1.5">Generated {generatedOn}</p>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Summary strip */}
              <div className={`grid gap-4 grid-cols-2 ${isAdmin ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Discharged</p>
                  <p className="text-[22px] md:text-[26px] font-semibold text-gray-900 tabular-nums leading-none">{totals.count}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">MUHCS Claim</p>
                  <p className="text-[22px] md:text-[26px] font-semibold text-emerald-600 tabular-nums leading-none">{formatINR(totals.claim)}</p>
                </div>
                {isAdmin && (
                  <>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Hospital Billed</p>
                      <p className="text-[22px] md:text-[26px] font-semibold text-gray-900 tabular-nums leading-none">{formatINR(totals.billed)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Difference</p>
                      <p className={`text-[22px] md:text-[26px] font-semibold tabular-nums leading-none ${totals.diff < 0 ? "text-red-500" : "text-emerald-600"}`}>
                        {formatDiff(totals.diff)}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Ward table */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Ward-wise Summary</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-[12px] md:text-[13px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className={`${thClass} text-left`}>Ward</th>
                        <th className={`${thClass} text-right`}>
                          <span className="md:hidden print:hidden">Pts</span>
                          <span className="hidden md:inline print:inline">Patients</span>
                        </th>
                        {isAdmin && <th className={`${thClass} text-right`}>Billed</th>}
                        <th className={`${thClass} text-right`}>Claim</th>
                        {isAdmin && <th className={`${thClass} text-right`}>Diff</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {wardRows.map(r => (
                        <tr key={r.value}>
                          <td className="px-3 md:px-5 py-3.5 font-medium text-gray-900">{r.label}</td>
                          <td className="px-3 md:px-5 py-3.5 text-right text-gray-600 tabular-nums">{r.count || "—"}</td>
                          {isAdmin && <td className="px-3 md:px-5 py-3.5 text-right text-gray-600 tabular-nums">{r.count ? formatINR(r.billed) : "—"}</td>}
                          <td className="px-3 md:px-5 py-3.5 text-right font-semibold text-emerald-600 tabular-nums">{r.count ? formatINR(r.claim) : "—"}</td>
                          {isAdmin && (
                            <td className={`px-3 md:px-5 py-3.5 text-right font-semibold tabular-nums ${r.diff < 0 ? "text-red-500" : "text-emerald-600"}`}>
                              {r.count ? formatDiff(r.diff) : "—"}
                            </td>
                          )}
                        </tr>
                      ))}
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td className="px-3 md:px-5 py-3.5 font-semibold text-gray-900">Total</td>
                        <td className="px-3 md:px-5 py-3.5 text-right font-semibold text-gray-900 tabular-nums">{totals.count}</td>
                        {isAdmin && <td className="px-3 md:px-5 py-3.5 text-right font-semibold text-gray-900 tabular-nums">{formatINR(totals.billed)}</td>}
                        <td className="px-3 md:px-5 py-3.5 text-right font-semibold text-emerald-600 tabular-nums">{formatINR(totals.claim)}</td>
                        {isAdmin && (
                          <td className={`px-3 md:px-5 py-3.5 text-right font-semibold tabular-nums ${totals.diff < 0 ? "text-red-500" : "text-emerald-600"}`}>
                            {formatDiff(totals.diff)}
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                  Patients are counted by discharge month.
                  {isAdmin
                    ? " Difference = MUHCS Claim − Hospital Billed; red (−) means the bill is above the claim, a loss."
                    : " Claim includes ward charges and approved add-ons."}
                </p>
              </div>

              {/* Patient-wise tables, ward by ward */}
              {WARDS.map(w => {
                const recs = patientsByWard[w.value] || []
                if (recs.length === 0) return null
                const sumBilled = recs.reduce((t, r) => t + r.billed, 0)
                const sumClaim  = recs.reduce((t, r) => t + r.claim, 0)
                const th = "px-1.5 md:px-3 py-2.5 text-[9px] md:text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
                const td = "px-1.5 md:px-3 py-2.5"
                return (
                  <div key={w.value}>
                    <div className="flex items-baseline justify-between mb-3">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{w.label} Ward</p>
                      <p className="text-[11px] text-gray-400 tabular-nums">{recs.length} patient{recs.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="border border-gray-100 rounded-xl overflow-x-auto print:overflow-visible">
                      <table className="w-full text-[10px] md:text-[12px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className={`${th} text-left`}>#</th>
                            <th className={`${th} text-left`}>Name</th>
                            <th className={`${th} text-left hidden md:table-cell print:table-cell`}>Category</th>
                            <th className={`${th} text-left`}>DOA</th>
                            <th className={`${th} text-left`}>DOD</th>
                            <th className={`${th} text-right`}>Days</th>
                            {isAdmin && <th className={`${th} text-right`}>Billed</th>}
                            <th className={`${th} text-right`}>Claim</th>
                            {isAdmin && <th className={`${th} text-right`}>Diff</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {recs.map((r, i) => (
                            <tr key={r.id} className="print:break-inside-avoid">
                              <td className={`${td} text-gray-300 tabular-nums`}>{i + 1}</td>
                              <td className={`${td} font-medium text-gray-900`}>
                                <div className="flex items-center gap-1.5">
                                  {r.category && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${CATEGORY_DOT[r.category] || "bg-gray-300"}`} />}
                                  <span>{r.name}</span>
                                </div>
                                {r.category && (
                                  <p className="md:hidden print:hidden text-[9px] font-normal text-gray-400 mt-0.5">{r.category}</p>
                                )}
                              </td>
                              <td className={`${td} text-gray-500 hidden md:table-cell print:table-cell`}>{r.category || "—"}</td>
                              <td className={`${td} text-gray-500 tabular-nums whitespace-nowrap`}>{shortDate(r.doa)}</td>
                              <td className={`${td} text-gray-500 tabular-nums whitespace-nowrap`}>{shortDate(r.dod)}</td>
                              <td className={`${td} text-right text-gray-500 tabular-nums`}>{r.days}</td>
                              {isAdmin && <td className={`${td} text-right text-gray-700 tabular-nums`}>{formatINR(r.billed)}</td>}
                              <td className={`${td} text-right font-semibold text-emerald-600 tabular-nums`}>{formatINR(r.claim)}</td>
                              {isAdmin && (
                                <td className={`${td} text-right font-semibold tabular-nums ${r.claim - r.billed < 0 ? "text-red-500" : "text-emerald-600"}`}>
                                  {formatDiff(r.claim - r.billed)}
                                </td>
                              )}
                            </tr>
                          ))}
                          <tr className="bg-gray-50 border-t border-gray-200 print:break-inside-avoid">
                            <td className={td} />
                            <td className={`${td} font-semibold text-gray-900`}>Total</td>
                            <td className={`${td} hidden md:table-cell print:table-cell`} />
                            <td className={td} />
                            <td className={td} />
                            <td className={td} />
                            {isAdmin && <td className={`${td} text-right font-semibold text-gray-900 tabular-nums`}>{formatINR(sumBilled)}</td>}
                            <td className={`${td} text-right font-semibold text-emerald-600 tabular-nums`}>{formatINR(sumClaim)}</td>
                            {isAdmin && (
                              <td className={`${td} text-right font-semibold tabular-nums ${sumClaim - sumBilled < 0 ? "text-red-500" : "text-emerald-600"}`}>
                                {formatDiff(sumClaim - sumBilled)}
                              </td>
                            )}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </main>
    </div>
    </AuthGuard>
  )
}