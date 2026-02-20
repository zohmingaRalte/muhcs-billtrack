"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { useUser } from "@/app/context/UserContext"
import AuthGuard from "@/app/context/AuthGuard"

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function calcDischarged(start, end) {
  if (!end) return 1
  const s = new Date(start); s.setHours(0,0,0,0)
  const e = new Date(end);   e.setHours(0,0,0,0)
  return Math.max(Math.round((e - s) / 86400000), 1)
}

function calcActive(start) {
  const s = new Date(start); s.setHours(0,0,0,0)
  const today = new Date();  today.setHours(0,0,0,0)
  return Math.round((today - s) / 86400000) + 1
}

function getDays(a) {
  return a.status === "discharged"
    ? calcDischarged(a.admission_date, a.discharge_date)
    : calcActive(a.admission_date)
}

function formatDate(date) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function formatINR(n) {
  return `₹${Number(n).toLocaleString("en-IN")}`
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()
  const { user, logout } = useUser()

  const [patientsCount, setPatientsCount]   = useState(0)
  const [admissions, setAdmissions]         = useState([])
  const [balanceMap, setBalanceMap]         = useState({})
  const [rates, setRates]                   = useState({ muhcs: 0, cabin: 0 })
  const [activeTab, setActiveTab]           = useState("active")
  const [totalClaim, setTotalClaim]         = useState(0)
  const [totalReceived, setTotalReceived]   = useState(0)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount]   = useState("")
  const [paymentDate, setPaymentDate]       = useState("")
  const [paymentSaving, setPaymentSaving]   = useState(false)
  const [paymentError, setPaymentError]     = useState("")
  const [loading, setLoading]               = useState(true)
  const [search, setSearch]                 = useState("")
  const [sortDir, setSortDir]               = useState("desc") // newest first by default

  const now = new Date()
  const [summaryMonth, setSummaryMonth]     = useState(now.getMonth())
  const [summaryYear, setSummaryYear]       = useState(now.getFullYear())

  const [showPwModal, setShowPwModal]       = useState(false)
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)
  const [oldPw, setOldPw]                   = useState("")
  const [newPw, setNewPw]                   = useState("")
  const [confirmPw, setConfirmPw]           = useState("")
  const [pwError, setPwError]               = useState("")
  const [pwSuccess, setPwSuccess]           = useState("")
  const [pwSaving, setPwSaving]             = useState(false)

  const tabRefs    = useRef({})
  const avatarRef  = useRef(null)
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    const el = tabRefs.current[activeTab]
    if (el) setUnderlineStyle({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeTab, admissions])

  useEffect(() => {
    function handleClick(e) {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) {
        setShowAvatarMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function fetchData() {
    setLoading(true)

    const { count } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
    setPatientsCount(count || 0)

    const { data: admissionData } = await supabase
      .from("admissions")
      .select(`id, admission_date, discharge_date, accommodation, status, total_bill_override, patients(full_name)`)
    setAdmissions(admissionData || [])

    const { data: ratesData } = await supabase.from("rate_master").select("*")
    const muhcs = ratesData?.find(r => r.description.toLowerCase().includes("muhcs"))?.amount || 0
    const cabin = ratesData?.find(r => r.description.toLowerCase().includes("cabin"))?.amount || 0
    const semiPrivate = ratesData?.find(r => r.description.toLowerCase().includes("semi"))?.amount || 0
    setRates({ muhcs, cabin, semiPrivate })

    const getWardAddon = (a, days) => {
      if (a.accommodation === "cabin") return days * cabin
      if (a.accommodation === "semi_private") return days * semiPrivate
      return 0
    }

    let total = 0
    admissionData?.filter(a => a.status === "discharged").forEach(a => {
      const days = calcDischarged(a.admission_date, a.discharge_date)
      total += days * muhcs + getWardAddon(a, days)
    })
    setTotalClaim(total)

    // Fetch total payments received
    const { data: payments } = await supabase.from("payments").select("amount")
    const received = (payments || []).reduce((s, p) => s + Number(p.amount), 0)
    setTotalReceived(received)

    const admIds = (admissionData || []).map(a => a.id)
    if (admIds.length > 0) {
      const [{ data: lab }, { data: pharma }, { data: xray }, { data: counter }] =
        await Promise.all([
          supabase.from("lab_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("pharma_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("xray_entries").select("admission_id, amount").in("admission_id", admIds),
          supabase.from("counter_entries").select("admission_id, amount").in("admission_id", admIds),
        ])

      const map = {}
      admissionData.forEach(a => {
        const days = getDays(a)
        const allowed = days * muhcs + getWardAddon(a, days)
        const hasOverride = a.total_bill_override !== null && a.total_bill_override !== undefined
        const sum = (arr, id) => (arr || []).filter(e => e.admission_id === id).reduce((s, e) => s + Number(e.amount), 0)
        const entriesTotal = sum(lab, a.id) + sum(pharma, a.id) + sum(xray, a.id) + sum(counter, a.id)
        const used = hasOverride ? Number(a.total_bill_override) : entriesTotal
        map[a.id] = { used, allowed }
      })
      setBalanceMap(map)
    }

    setLoading(false)
  }

  async function handlePasswordChange() {
    setPwError(""); setPwSuccess("")
    if (!oldPw) { setPwError("Enter your current password."); return }
    if (!newPw || newPw.length < 4) { setPwError("New password must be at least 4 characters."); return }
    if (newPw !== confirmPw) { setPwError("Passwords don't match."); return }

    setPwSaving(true)
    const { data, error } = await supabase
      .from("users").select("password").eq("id", user.id).single()

    if (error || !data) { setPwError("Could not verify current password."); setPwSaving(false); return }
    if (data.password !== oldPw) { setPwError("Current password is incorrect."); setPwSaving(false); return }

    const { error: updateErr } = await supabase
      .from("users").update({ password: newPw }).eq("id", user.id)

    if (updateErr) { setPwError(updateErr.message); setPwSaving(false); return }

    setPwSuccess("Password changed successfully!")
    setPwSaving(false)
    setOldPw(""); setNewPw(""); setConfirmPw("")
    setTimeout(() => { setShowPwModal(false); setPwSuccess("") }, 1500)
  }

  const activeCases     = admissions.filter(a => a.status === "admitted")
  const dischargedCases = admissions.filter(a => a.status === "discharged")
  const baseData        = activeTab === "active" ? activeCases : dischargedCases
  const filteredData    = search.trim()
    ? baseData.filter(a => a.patients?.full_name?.toLowerCase().includes(search.toLowerCase()))
    : baseData
  const displayData     = [...filteredData].sort((a, b) => {
    const da = new Date(a.admission_date)
    const db = new Date(b.admission_date)
    return sortDir === "asc" ? da - db : db - da
  })

  const tabs = [
    { key: "active",     label: "Active",     count: activeCases.length },
    { key: "discharged", label: "Discharged", count: dischargedCases.length },
  ]

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

  const monthlyAdmissions = admissions.filter(a => {
    const d = new Date(a.admission_date)
    return d.getMonth() === summaryMonth && d.getFullYear() === summaryYear
  })
  const monthlyDischarged = monthlyAdmissions.filter(a => a.status === "discharged")
  const monthlyClaim = monthlyDischarged.reduce((total, a) => {
    const days = calcDischarged(a.admission_date, a.discharge_date)
    const addon = a.accommodation === "cabin" ? days * rates.cabin
      : a.accommodation === "semi_private" ? days * rates.semiPrivate : 0
    return total + days * rates.muhcs + addon
  }, 0)
  const monthlyUsed = monthlyDischarged.reduce((total, a) => {
    return total + (balanceMap[a.id]?.used || 0)
  }, 0)

  async function savePayment() {
    setPaymentError("")
    if (!paymentAmount || isNaN(paymentAmount) || Number(paymentAmount) <= 0) {
      setPaymentError("Enter a valid amount."); return
    }
    if (!paymentDate) { setPaymentError("Select a date."); return }
    setPaymentSaving(true)
    const { error } = await supabase.from("payments").insert({
      amount: Number(paymentAmount),
      payment_date: paymentDate,
      created_by: user?.id,
    })
    if (error) { setPaymentError(error.message); setPaymentSaving(false); return }
    setPaymentSaving(false)
    setShowPaymentModal(false)
    setPaymentAmount(""); setPaymentDate("")
    fetchData()
  }

  const yearOptions = []
  for (let y = 2024; y <= now.getFullYear(); y++) yearOptions.push(y)

  return (
    <AuthGuard>
    <div className="min-h-screen bg-[#f5f5f7]">

      {/* Password modal */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => { setShowPwModal(false); setPwError(""); setPwSuccess("") }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-[17px] font-semibold text-gray-900">Change Password</h2>
            {[
              { label: "Current Password", value: oldPw, set: setOldPw },
              { label: "New Password",     value: newPw, set: setNewPw },
              { label: "Confirm New",      value: confirmPw, set: setConfirmPw },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">{f.label}</label>
                <input
                  type="password"
                  value={f.value}
                  onChange={e => { f.set(e.target.value); setPwError("") }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
                />
              </div>
            ))}
            {pwError   && <p className="text-[12px] text-red-500">{pwError}</p>}
            {pwSuccess && <p className="text-[12px] text-emerald-600 font-medium">{pwSuccess}</p>}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowPwModal(false); setPwError(""); setPwSuccess("") }}
                className="flex-1 py-3 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-95 transition"
              >Cancel</button>
              <button
                onClick={handlePasswordChange}
                disabled={pwSaving}
                className="flex-1 py-3 text-[13px] font-semibold text-white bg-gray-900 hover:bg-gray-700 active:scale-95 disabled:opacity-50 rounded-xl transition"
              >{pwSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal — admin only */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => { setShowPaymentModal(false); setPaymentError("") }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-[17px] font-semibold text-gray-900">Add Payment Received</h2>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Amount (₹)</label>
              <input
                type="number"
                placeholder="e.g. 50000"
                value={paymentAmount}
                onChange={e => { setPaymentAmount(e.target.value); setPaymentError("") }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => { setPaymentDate(e.target.value); setPaymentError("") }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
              />
            </div>
            {paymentError && <p className="text-[12px] text-red-500">{paymentError}</p>}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowPaymentModal(false); setPaymentError("") }}
                className="flex-1 py-3 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-95 transition"
              >Cancel</button>
              <button
                onClick={savePayment}
                disabled={paymentSaving}
                className="flex-1 py-3 text-[13px] font-semibold text-white bg-gray-900 hover:bg-gray-700 active:scale-95 disabled:opacity-50 rounded-xl transition"
              >{paymentSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-black/[0.06] px-5 md:px-14 py-4 md:py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <img
              src="/logo.jpg"
              alt="Mercy Hospital"
              className="h-12 w-12 md:h-14 md:w-14 rounded-full object-cover shrink-0 shadow-sm"
            />
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase leading-none mb-0.5">Mercy Hospital</p>
              <h1 className="text-[20px] md:text-[24px] font-semibold text-gray-900 tracking-tight leading-none">MUHCS Tracker</h1>
            </div>
          </div>

          <div className="flex items-center gap-3" ref={avatarRef}>
            <span className="hidden md:block text-[13px] font-medium text-gray-500">{user?.name}</span>
            <div className="relative">
              <button
                onClick={() => setShowAvatarMenu(v => !v)}
                className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-gray-900 hover:bg-gray-700 active:scale-95 flex items-center justify-center shrink-0 transition"
              >
                <span className="text-white text-xs font-semibold">{user?.name?.slice(0, 2).toUpperCase()}</span>
              </button>
              {showAvatarMenu && (
                <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl border border-gray-100 shadow-xl py-1 z-20">
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    <p className="text-[13px] font-semibold text-gray-900">{user?.name}</p>
                    <p className="text-[11px] text-gray-400 capitalize">{user?.role}</p>
                  </div>
                  <button
                    onClick={() => { setShowAvatarMenu(false); setShowPwModal(true) }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition"
                  >Change Password</button>
                  <button
                    onClick={() => { logout(); router.push("/login") }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-red-500 hover:bg-red-50 active:bg-red-100 transition"
                  >Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 md:px-14 py-8 md:py-14">

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-8 md:mb-10">
          <StatCard label="Total Patients" value={loading ? "—" : patientsCount} color="gray" />
          <StatCard label="Active Cases"   value={loading ? "—" : activeCases.length} color="green" accent />
          <StatCard label="Discharged"     value={loading ? "—" : dischargedCases.length} color="blue" />
          <ClaimCard
            claim={loading ? null : totalClaim}
            received={loading ? null : totalReceived}
            isAdmin={user?.role === "admin"}
            onAdd={() => { setPaymentAmount(""); setPaymentDate(new Date().toISOString().split("T")[0]); setShowPaymentModal(true) }}
          />
        </div>

        {/* Monthly Summary */}
        <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-8 py-5 md:py-6 mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Monthly Summary</p>
            <div className="flex items-center gap-2">
              <select
                value={summaryMonth}
                onChange={e => setSummaryMonth(Number(e.target.value))}
                className="text-[13px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10 hover:bg-gray-100 transition cursor-pointer"
              >
                {monthNames.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select
                value={summaryYear}
                onChange={e => setSummaryYear(Number(e.target.value))}
                className="text-[13px] font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10 hover:bg-gray-100 transition cursor-pointer"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryItem label="Admissions"   value={monthlyAdmissions.length} />
            <SummaryItem label="Discharged"   value={monthlyDischarged.length} />
            <SummaryItem label="Total Billed" value={formatINR(monthlyUsed)} />
            <SummaryItem label="MUHCS Claim"  value={formatINR(monthlyClaim)} />
          </div>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-xl md:rounded-2xl shadow-sm border border-black/[0.06] overflow-hidden">
          <div className="px-6 md:px-10 pt-6 md:pt-8 pb-0 border-b border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-[17px] md:text-[22px] font-semibold text-gray-900 tracking-tight">Patients</h2>
                <button
                  onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 active:scale-95 px-3 py-1.5 rounded-full transition"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    {sortDir === "asc"
                      ? <path d="M12 5l7 14H5L12 5z" fill="currentColor"/>
                      : <path d="M12 19L5 5h14L12 19z" fill="currentColor"/>
                    }
                  </svg>
                  {sortDir === "asc" ? "Oldest first" : "Newest first"}
                </button>
              </div>
              {user?.role !== "viewer" && (
              <button
                onClick={() => router.push("/patients/new")}
                className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 active:scale-95 text-white text-[13px] font-medium px-4 py-2 rounded-full transition"
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Add Patient
              </button>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-5">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder="Search patient name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="relative flex gap-7">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  ref={el => (tabRefs.current[tab.key] = el)}
                  onClick={() => setActiveTab(tab.key)}
                  className={`pb-3 text-[14px] md:text-[15px] font-medium transition-colors duration-150 flex items-center gap-2 ${
                    activeTab === tab.key ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {tab.label}
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums transition ${
                    activeTab === tab.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                  }`}>{tab.count}</span>
                </button>
              ))}
              <span
                className="absolute bottom-0 h-[2px] bg-gray-900 rounded-full transition-all duration-200 ease-out"
                style={{ left: underlineStyle.left, width: underlineStyle.width }}
              />
            </div>
          </div>

          {/* Table body */}
          <div className="px-6 md:px-10">
            {loading ? (
              <div className="py-20 text-center text-gray-300 text-[14px]">Loading…</div>
            ) : displayData.length === 0 ? (
              <div className="py-20 text-center text-gray-300 text-[14px]">
                {search ? `No results for "${search}"` : "No records found"}
              </div>
            ) : (
              <>
                {/* Desktop */}
                <table className="hidden md:table w-full text-[15px] text-gray-900">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="py-5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Name</th>
                      <th className="py-5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Ward</th>
                      <th className="py-5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">DOA</th>
                      {activeTab === "discharged" && (
                        <th className="py-5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">DOD</th>
                      )}
                      <th className="py-5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Days</th>
                      {activeTab === "discharged" && (
                        <th className="py-5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Hospital Bill</th>
                      )}
                      {activeTab === "discharged" ? (
                        <th className="py-5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Claim</th>
                      ) : (
                        <th className="py-5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Status</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayData.map(a => {
                      const b = balanceMap[a.id]
                      const pct = b && b.allowed > 0 ? Math.min((b.used / b.allowed) * 100, 100) : 0
                      const barColor = pct >= 95 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-emerald-400"
                      const claim = b ? b.allowed : 0
                      return (
                        <tr
                          key={a.id}
                          onClick={() => router.push(`/patients/${a.id}`)}
                          className="hover:bg-gray-50 active:bg-gray-100 transition-colors duration-100 cursor-pointer group"
                        >
                          <td className="py-4">
                            <p className="font-medium text-gray-900 group-hover:text-black">{a.patients?.full_name}</p>
                            {b && activeTab === "active" && (
                              <div className="mt-1.5 h-1 w-24 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </td>
                          <td className="py-4 text-gray-500 capitalize">{a.accommodation === "semi_private" ? "Semi Private" : a.accommodation}</td>
                          <td className="py-4 text-gray-500">{formatDate(a.admission_date)}</td>
                          {activeTab === "discharged" && (
                            <td className="py-4 text-gray-500">{formatDate(a.discharge_date)}</td>
                          )}
                          <td className="py-4 text-gray-500">{getDays(a)}d</td>
                          {activeTab === "discharged" && (
                            <td className="py-4 text-gray-500 tabular-nums">{b ? formatINR(b.used) : "—"}</td>
                          )}
                          {activeTab === "discharged" ? (
                            <td className="py-4 font-semibold text-emerald-600 tabular-nums">{formatINR(claim)}</td>
                          ) : (
                            <td className="py-4"><StatusPill status={a.status} /></td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Mobile */}
                <div className="md:hidden divide-y divide-gray-50">
                  {displayData.map(a => {
                    const b = balanceMap[a.id]
                    const pct = b && b.allowed > 0 ? Math.min((b.used / b.allowed) * 100, 100) : 0
                    const barColor = pct >= 95 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-emerald-400"
                    const claim = b ? b.allowed : 0
                    return (
                      <div
                        key={a.id}
                        onClick={() => router.push(`/patients/${a.id}`)}
                        className="py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors rounded-xl -mx-2 px-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[15px] text-gray-900 truncate">{a.patients?.full_name}</p>
                          {b && activeTab === "active" && (
                            <div className="mt-1 h-1 w-20 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                          )}
                          <p className="text-[12px] text-gray-400 mt-1 capitalize">
                            {a.accommodation === "semi_private" ? "Semi Private" : a.accommodation} · {formatDate(a.admission_date)}
                            {activeTab === "discharged" && a.discharge_date ? ` → ${formatDate(a.discharge_date)}` : ""}
                            {" "}· {getDays(a)}d
                          </p>
                        </div>
                        <div className="ml-4 flex items-center gap-2 shrink-0">
                          {activeTab === "discharged" ? (
                            <div className="text-right">
                              <p className="text-[11px] text-gray-400 tabular-nums">{b ? formatINR(b.used) : "—"}</p>
                              <p className="text-[13px] font-semibold text-emerald-600 tabular-nums">{formatINR(claim)}</p>
                            </div>
                          ) : (
                            <StatusPill status={a.status} />
                          )}
                          <svg className="text-gray-300" width="7" height="12" viewBox="0 0 7 12" fill="none">
                            <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {!loading && displayData.length > 0 && (
            <div className="px-6 md:px-10 py-4 border-t border-gray-50">
              <p className="text-[12px] text-gray-300 tabular-nums">
                {displayData.length} record{displayData.length !== 1 ? "s" : ""}
                {search && ` matching "${search}"`}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
    </AuthGuard>
  )
}

// ─── SUB COMPONENTS ───────────────────────────────────────────────────────────

function ClaimCard({ claim, received, isAdmin, onAdd }) {
  const pending = claim !== null && received !== null ? claim - received : null
  return (
    <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm p-4 md:p-7 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-amber-400" />
          <span className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest leading-tight">Claim</span>
        </div>
        {isAdmin && (
          <button
            onClick={onAdd}
            className="h-5 w-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition active:scale-95"
            title="Add payment"
          >
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="#374151" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        )}
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

function StatCard({ label, value, color, accent }) {
  const colorMap = {
    gray:   { dot: "bg-gray-400",    text: "text-gray-900" },
    green:  { dot: "bg-emerald-400", text: "text-emerald-600" },
    blue:   { dot: "bg-blue-400",    text: "text-blue-600" },
    orange: { dot: "bg-amber-400",   text: "text-amber-600" },
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

function SummaryItem({ label, value }) {
  return (
    <div>
      <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-[18px] md:text-[22px] font-semibold text-gray-900 tabular-nums tracking-tight">{value}</p>
    </div>
  )
}

function StatusPill({ status }) {
  const admitted = status === "admitted"
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
      admitted ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
    }`}>
      {admitted && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </span>
      )}
      {admitted ? "Active" : "Discharged"}
    </span>
  )
}