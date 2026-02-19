"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { useUser } from "@/app/context/UserContext"
import AuthGuard from "@/app/context/AuthGuard"

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function calcDays(admissionDate, dischargeDate) {
  const s = new Date(admissionDate)
  s.setHours(0, 0, 0, 0)
  if (dischargeDate) {
    const e = new Date(dischargeDate)
    e.setHours(0, 0, 0, 0)
    return Math.max(Math.round((e - s) / 86400000), 1)
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((today - s) / 86400000) + 1
}

function formatDate(date) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function formatTime(ts) {
  if (!ts) return "—"
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function formatINR(amount) {
  return `₹${Number(amount).toLocaleString("en-IN")}`
}

// ─── BALANCE INDICATOR ───────────────────────────────────────────────────────

function BalanceBar({ used, allowed, alertAllowed }) {
  // Alert color uses alertAllowed (conservative)
  const alertPct = alertAllowed > 0 ? Math.min((used / alertAllowed) * 100, 100) : 0
  const alertOver = used > alertAllowed

  let barColor = "bg-emerald-400"
  let textColor = "text-emerald-600"
  let bgColor = "bg-emerald-50"
  let label = "Safe"

  if (alertOver) {
    barColor = "bg-red-500"
    textColor = "text-red-600"
    bgColor = "bg-red-50"
    label = "Exceeded"
  } else if (alertPct >= 95) {
    barColor = "bg-red-400"
    textColor = "text-red-600"
    bgColor = "bg-red-50"
    label = "Critical"
  } else if (alertPct >= 80) {
    barColor = "bg-amber-400"
    textColor = "text-amber-600"
    bgColor = "bg-amber-50"
    label = "Warning"
  }

  // Display numbers use real allowed
  const displayPct = allowed > 0 ? Math.min((used / allowed) * 100, 100) : 0
  const realOver = used > allowed
  const balance = allowed - used

  return (
    <div className={`rounded-xl md:rounded-2xl p-5 md:p-6 ${bgColor}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-[11px] font-semibold uppercase tracking-widest ${textColor}`}>
          {label}
        </span>
        <span className={`text-[11px] font-semibold tabular-nums ${textColor}`}>
          {displayPct.toFixed(1)}% used
        </span>
      </div>

      {/* Progress bar uses alertPct for visual */}
      <div className="h-2 bg-black/10 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${alertPct}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Allowed" value={formatINR(allowed)} />
        <Stat label="Used" value={formatINR(used)} />
        <Stat
          label={realOver ? "Excess" : "Remaining"}
          value={formatINR(Math.abs(balance))}
          highlight={realOver ? "red" : displayPct >= 80 ? "amber" : "green"}
        />
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }) {
  const color =
    highlight === "red" ? "text-red-600" :
    highlight === "amber" ? "text-amber-600" :
    highlight === "green" ? "text-emerald-600" :
    "text-gray-900"

  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-[15px] md:text-[17px] font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

// ─── ENTRY ROW ───────────────────────────────────────────────────────────────

function EntryRow({ entry, canEdit, onEdit, onDelete }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-gray-50 last:border-0 group">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-gray-400">
          {formatTime(entry.entry_date)}
          {entry.users?.name ? ` · ${entry.users.name}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        <span className="text-[14px] md:text-[15px] font-semibold text-gray-900 tabular-nums">
          {formatINR(entry.amount)}
        </span>
        {canEdit && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(entry)}
              className="text-[11px] text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(entry)}
              className="text-[11px] text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ADD / EDIT ENTRY FORM ───────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0]
}

function EntryForm({ dept, admissionId, userId, editTarget, onSave, onCancel }) {
  const [amount, setAmount] = useState(editTarget?.amount?.toString() || "")
  const [entryDate, setEntryDate] = useState(
    editTarget?.entry_date ? editTarget.entry_date.split("T")[0] : todayStr()
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")

    if (!amount || isNaN(amount) || Number(amount) <= 0)
      return setError("Enter a valid amount.")

    setSaving(true)
    const table = dept === "lab" ? "lab_entries" : dept === "xray" ? "xray_entries" : "pharma_entries"

    if (editTarget) {
      const { error: err } = await supabase
        .from(table)
        .update({
          amount: Number(amount),
          entry_date: entryDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editTarget.id)

      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from(table)
        .insert({
          admission_id: admissionId,
          amount: Number(amount),
          entry_date: entryDate,
          created_by: userId,
        })

      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    onSave()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 md:p-5 mt-3 space-y-3">
      <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest">
        {editTarget ? "Edit Entry" : `Add ${dept === "lab" ? "Lab" : dept === "xray" ? "X-Ray" : "Pharma"} Entry`}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          placeholder="Amount (₹)"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          min="0"
          step="0.01"
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
        />
        <input
          type="date"
          value={entryDate}
          onChange={e => setEntryDate(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
        />
      </div>

      {error && (
        <p className="text-[12px] text-red-500">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-[13px] font-semibold py-2.5 rounded-xl transition"
        >
          {saving ? "Saving…" : editTarget ? "Save Changes" : "Add Entry"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-[13px] font-medium text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── ENTRIES SECTION ─────────────────────────────────────────────────────────

function EntriesSection({ title, dept, entries, admissionId, userId, canAdd, canEdit, onRefresh }) {
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  const total = entries.reduce((sum, e) => sum + Number(e.amount), 0)

  async function handleDelete(entry) {
    const table = dept === "lab" ? "lab_entries" : dept === "xray" ? "xray_entries" : "pharma_entries"
    if (!confirm(`Delete this entry (${formatINR(entry.amount)})?`)) return
    await supabase.from(table).delete().eq("id", entry.id)
    onRefresh()
  }

  function handleEdit(entry) {
    setEditTarget(entry)
    setShowForm(true)
  }

  function handleSaved() {
    setShowForm(false)
    setEditTarget(null)
    onRefresh()
  }

  return (
    <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 md:px-7 py-4 md:py-5 border-b border-gray-50">
        <div>
          <h3 className="text-[15px] md:text-[17px] font-semibold text-gray-900">{title}</h3>
          {entries.length > 0 && (
            <p className="text-[12px] text-gray-400 mt-0.5 tabular-nums">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} · {formatINR(total)}
            </p>
          )}
        </div>
        {canAdd && !showForm && (
          <button
            onClick={() => { setEditTarget(null); setShowForm(true) }}
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-900 bg-gray-100 hover:bg-gray-200 px-3.5 py-2 rounded-full transition"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Add
          </button>
        )}
      </div>

      {/* Entries list */}
      <div className="px-5 md:px-7">
        {entries.length === 0 && !showForm ? (
          <p className="text-[13px] text-gray-300 py-6 text-center">No entries yet</p>
        ) : (
          entries.map(entry => (
            <EntryRow
              key={entry.id}
              entry={entry}
              canEdit={canEdit}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}

        {/* Add / edit form */}
        {showForm && (
          <EntryForm
            dept={dept}
            admissionId={admissionId}
            userId={userId}
            editTarget={editTarget}
            onSave={handleSaved}
            onCancel={() => { setShowForm(false); setEditTarget(null) }}
          />
        )}

        {/* Total row */}
        {entries.length > 0 && (
          <div className="flex justify-between items-center py-4 border-t border-gray-100 mt-1">
            <span className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest">Total</span>
            <span className="text-[15px] md:text-[17px] font-semibold text-gray-900 tabular-nums">
              {formatINR(total)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function PatientDetailPage({ params }) {
  const { id } = React.use(params)
  const router = useRouter()
  const { user } = useUser()

  const [admission, setAdmission] = useState(null)
  const [labEntries, setLabEntries] = useState([])
  const [pharmaEntries, setPharmaEntries] = useState([])
  const [xrayEntries, setXrayEntries] = useState([])
  const [counterEntries, setCounterEntries] = useState([])
  const [rates, setRates] = useState({ muhcs: 0, cabin: 0, bed: 0 })
  const [loading, setLoading] = useState(true)
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [dischargeDate, setDischargeDate] = useState("")
  const [discharging, setDischarging] = useState(false)
  const [dischargeError, setDischargeError] = useState("")

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editAge, setEditAge] = useState("")
  const [editGender, setEditGender] = useState("male")
  const [editContact, setEditContact] = useState("")
  const [editAdmissionDate, setEditAdmissionDate] = useState("")
  const [editAccommodation, setEditAccommodation] = useState("general")
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState("")

  // Total bill override
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [overrideInput, setOverrideInput] = useState("")
  const [overrideSaving, setOverrideSaving] = useState(false)
  const [overrideError, setOverrideError] = useState("")

  useEffect(() => {
    if (id) fetchAll()
  }, [id])

  async function fetchAll() {
    setLoading(true)

    // Admission + patient info
    const { data: adm, error: admError } = await supabase
      .from("admissions")
      .select(`
        id,
        patient_id,
        admission_date,
        discharge_date,
        accommodation,
        status,
        total_bill_override,
        patients (full_name, gender, age, contact)
      `)
      .eq("id", id)
      .single()

    if (admError) {
      console.error("Admission fetch error:", admError.message)
      setLoading(false)
      return
    }
    setAdmission(adm)

    // Rates
    const { data: ratesData } = await supabase.from("rate_master").select("*")
    const muhcs = ratesData?.find(r => r.description.toLowerCase().includes("muhcs"))?.amount || 0
    const cabin = ratesData?.find(r => r.description.toLowerCase().includes("cabin"))?.amount || 0
    const bed = ratesData?.find(r => r.description.toLowerCase().includes("bed"))?.amount || 0
    const semiPrivate = ratesData?.find(r => r.description.toLowerCase().includes("semi"))?.amount || 0
    setRates({ muhcs, cabin, bed, semiPrivate })

    // Lab entries with creator name
    const { data: lab } = await supabase
      .from("lab_entries")
      .select("*, users(name)")
      .eq("admission_id", id)
      .order("entry_date", { ascending: false })

    setLabEntries(lab || [])

    // Pharma entries with creator name
    const { data: pharma } = await supabase
      .from("pharma_entries")
      .select("*, users(name)")
      .eq("admission_id", id)
      .order("entry_date", { ascending: false })

    setPharmaEntries(pharma || [])

    // Xray entries with creator name
    const { data: xray } = await supabase
      .from("xray_entries")
      .select("*, users(name)")
      .eq("admission_id", id)
      .order("entry_date", { ascending: false })

    setXrayEntries(xray || [])

    // Counter entries with creator name
    const { data: counter } = await supabase
      .from("counter_entries")
      .select("*, users(name)")
      .eq("admission_id", id)
      .order("entry_date", { ascending: false })

    setCounterEntries(counter || [])
    setLoading(false)
  }

  if (loading || !id) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <p className="text-gray-300 text-[14px]">Loading…</p>
      </div>
    )
  }

  if (!admission) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <p className="text-gray-400 text-[14px]">Patient not found.</p>
      </div>
    )
  }

  // ─── Calculations ──────────────────────────────────────────────────────────
  const isActive = admission.status === "admitted"
  const days = calcDays(admission.admission_date, admission.discharge_date)
  const baseAllowed = days * rates.muhcs

  const wardRate = admission.accommodation === "cabin" ? rates.cabin
    : admission.accommodation === "semi_private" ? rates.semiPrivate
    : rates.bed

  const cabinAddon = admission.accommodation !== "general" ? days * wardRate : 0
  const totalAllowed = baseAllowed + cabinAddon

  // Alert allowed: for active patients use one day less (min 1) to warn earlier
  const alertDays = isActive ? Math.max(days - 1, 1) : days
  const alertAllowed = alertDays * rates.muhcs + (admission.accommodation !== "general" ? alertDays * wardRate : 0)

  // Bed fee
  const bedFee = days * wardRate

  const labTotal = labEntries.reduce((s, e) => s + Number(e.amount), 0)
  const pharmaTotal = pharmaEntries.reduce((s, e) => s + Number(e.amount), 0)
  const xrayTotal = xrayEntries.reduce((s, e) => s + Number(e.amount), 0)
  const counterTotal = counterEntries.reduce((s, e) => s + Number(e.amount), 0)
  const entriesTotal = labTotal + pharmaTotal + xrayTotal + counterTotal
  const hasOverride = admission.total_bill_override !== null && admission.total_bill_override !== undefined
  const totalUsed = hasOverride ? Number(admission.total_bill_override) : entriesTotal

  // ─── Role flags ───────────────────────────────────────────────────────────
  const isAdmin = user?.role === "admin"
  const isCounter = user?.role === "counter"
  const isLab = user?.role === "lab"
  const isXray = user?.role === "xray"
  const isPharma = user?.role === "pharma"
  const isViewer = user?.role === "viewer"
  const isAdminOrCounter = isAdmin || isCounter

  const canAddLab = isAdmin || isLab
  const canAddPharma = isAdmin || isPharma
  const canAddXray = isAdmin || isXray
  const canAddCounter = isAdminOrCounter
  const canEditAny = isAdminOrCounter
  const showLab = isAdmin || isCounter || isLab || isViewer
  const showPharma = isAdmin || isCounter || isPharma || isViewer
  const showXray = isAdmin || isCounter || isXray || isViewer
  const showCounter = isAdminOrCounter || isViewer

  function startEdit() {
    setEditName(admission.patients?.full_name || "")
    setEditAge(admission.patients?.age?.toString() || "")
    setEditGender(admission.patients?.gender || "male")
    setEditContact(admission.patients?.contact || "")
    setEditAdmissionDate(admission.admission_date || "")
    setEditAccommodation(admission.accommodation || "general")
    setEditError("")
    setEditing(true)
  }

  async function saveEdit() {
    if (!editName.trim()) { setEditError("Full name is required."); return }
    if (!editAge || isNaN(editAge) || Number(editAge) <= 0) { setEditError("Enter a valid age."); return }
    if (!editAdmissionDate) { setEditError("Admission date is required."); return }

    setEditSaving(true)
    setEditError("")

    const { error: patErr } = await supabase
      .from("patients")
      .update({
        full_name: editName.trim(),
        age: Number(editAge),
        gender: editGender,
        contact: editContact.trim() || null,
      })
      .eq("id", admission.patient_id)

    if (patErr) { setEditError(patErr.message); setEditSaving(false); return }

    const { error: admErr } = await supabase
      .from("admissions")
      .update({
        admission_date: editAdmissionDate,
        accommodation: editAccommodation,
      })
      .eq("id", id)

    if (admErr) { setEditError(admErr.message); setEditSaving(false); return }

    setEditSaving(false)
    setEditing(false)
    fetchAll()
  }

  async function saveOverride() {
    if (!overrideInput || isNaN(overrideInput) || Number(overrideInput) < 0) {
      setOverrideError("Enter a valid amount."); return
    }
    setOverrideSaving(true)
    const { error } = await supabase
      .from("admissions")
      .update({ total_bill_override: Number(overrideInput) })
      .eq("id", id)
    if (error) { setOverrideError(error.message); setOverrideSaving(false); return }
    setOverrideSaving(false)
    setShowOverrideForm(false)
    setOverrideInput("")
    fetchAll()
  }

  async function clearOverride() {
    await supabase.from("admissions").update({ total_bill_override: null }).eq("id", id)
    fetchAll()
  }

  async function handleDischarge() {
    if (!dischargeDate) { setDischargeError("Please select a discharge date."); return }
    const admit = new Date(admission.admission_date)
    const discharge = new Date(dischargeDate)
    admit.setHours(0,0,0,0)
    discharge.setHours(0,0,0,0)
    if (discharge < admit) { setDischargeError("Discharge date cannot be before admission date."); return }

    setDischarging(true)
    const { error } = await supabase
      .from("admissions")
      .update({ discharge_date: dischargeDate, status: "discharged" })
      .eq("id", id)

    if (error) { setDischargeError(error.message); setDischarging(false); return }
    setShowDischargeModal(false)
    setDischarging(false)
    fetchAll()
  }

  return (
    <AuthGuard>
    <div className="min-h-screen bg-[#f5f5f7]">

      {/* Discharge Modal */}
      {showDischargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowDischargeModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h2 className="text-[17px] font-semibold text-gray-900">Discharge Patient</h2>
              <p className="text-[13px] text-gray-400 mt-1">
                Select the discharge date. This day will <span className="font-medium text-gray-600">not</span> be counted in the MUHCS bill.
              </p>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">
                Discharge Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={dischargeDate}
                onChange={e => { setDischargeDate(e.target.value); setDischargeError("") }}
                min={admission.admission_date}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
              />
              {dischargeError && (
                <p className="text-[11px] text-red-500 mt-1">{dischargeError}</p>
              )}
            </div>

            {/* Days preview */}
            {dischargeDate && (
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-[12px] text-gray-400">
                  Billable days:{" "}
                  <span className="font-semibold text-gray-900">
                    {Math.max(Math.round((new Date(dischargeDate) - new Date(admission.admission_date)) / 86400000), 1)} days
                  </span>
                  <span className="ml-1 text-gray-400">(discharge day excluded)</span>
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowDischargeModal(false); setDischargeError("") }}
                className="flex-1 py-3 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDischarge}
                disabled={discharging}
                className="flex-1 py-3 text-[13px] font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 rounded-xl transition"
              >
                {discharging ? "Saving…" : "Confirm Discharge"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#f5f5f7]/80 backdrop-blur-xl border-b border-black/[0.06] px-5 md:px-14 py-4 md:py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition shadow-sm"
            >
              <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
                <path d="M6 1L1 6l5 5" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">
                Patient Detail
              </p>
              <h1 className="text-[18px] md:text-[22px] font-semibold text-gray-900 tracking-tight leading-none">
                {admission.patients?.full_name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Discharge button — admin/counter only, active patients only */}
            {isAdminOrCounter && isActive && (
              <button
                onClick={() => { setDischargeDate(""); setDischargeError(""); setShowDischargeModal(true) }}
                className="hidden md:flex items-center gap-1.5 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-full transition shadow-sm"
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M9 1h3a1 1 0 011 1v10a1 1 0 01-1 1H9M6 10l3-3-3-3M9 7H1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Discharge
              </button>
            )}

            {/* Status badge */}
            <span className={`hidden md:inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full ${
              isActive ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
            }`}>
              {isActive && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
              )}
              {isActive ? "Active" : "Discharged"}
            </span>

            {/* User avatar */}
            <div className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-semibold">
                {user?.name?.slice(0, 2).toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 md:px-14 py-8 md:py-12 space-y-4 md:space-y-6">

        {/* Patient info card */}
        <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5 md:py-6">
          <div className="flex items-center justify-between mb-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Patient Info
            </p>
            {isAdminOrCounter && !editing && (
              <button
                onClick={startEdit}
                className="text-[12px] font-medium text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full transition"
              >
                Edit
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <EditField label="Full Name" required>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className={editInputClass()}
                  />
                </EditField>
                <EditField label="Age" required>
                  <input
                    type="number"
                    value={editAge}
                    onChange={e => setEditAge(e.target.value)}
                    min="1" max="120"
                    className={editInputClass()}
                  />
                </EditField>
                <EditField label="Gender">
                  <div className="grid grid-cols-2 gap-2">
                    {["male", "female"].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setEditGender(g)}
                        className={`py-2.5 rounded-xl border-2 text-[13px] font-semibold capitalize transition ${
                          editGender === g
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </EditField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <EditField label="Contact">
                  <input
                    type="tel"
                    value={editContact}
                    onChange={e => setEditContact(e.target.value)}
                    className={editInputClass()}
                  />
                </EditField>
                <EditField label="Admission Date" required>
                  <input
                    type="date"
                    value={editAdmissionDate}
                    onChange={e => setEditAdmissionDate(e.target.value)}
                    className={editInputClass()}
                  />
                </EditField>
              </div>

              <EditField label="Ward Type">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "general",     label: "General",     sub: "₹400/day" },
                      { value: "semi_private", label: "Semi Private", sub: "₹800/day" },
                      { value: "cabin",       label: "Cabin",       sub: "₹1,500/day" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditAccommodation(opt.value)}
                        className={`text-left px-3 py-2.5 rounded-xl border-2 transition ${
                          editAccommodation === opt.value
                            ? "border-gray-900 bg-gray-900"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <p className={`text-[13px] font-semibold ${editAccommodation === opt.value ? "text-white" : "text-gray-900"}`}>
                          {opt.label}
                        </p>
                        <p className={`text-[10px] mt-0.5 ${editAccommodation === opt.value ? "text-gray-300" : "text-gray-400"}`}>
                          {opt.sub}
                        </p>
                      </button>
                    ))}
                  </div>
                </EditField>

              {editError && (
                <p className="text-[12px] text-red-500">{editError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setEditing(false); setEditError("") }}
                  className="flex-1 py-2.5 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={editSaving}
                  className="flex-1 py-2.5 text-[13px] font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 rounded-xl transition"
                >
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <InfoItem label="Name" value={admission.patients?.full_name} />
              <InfoItem label="Age" value={admission.patients?.age ? `${admission.patients.age} yrs` : "—"} />
              <InfoItem label="Gender" value={admission.patients?.gender ? admission.patients.gender.charAt(0).toUpperCase() + admission.patients.gender.slice(1) : "—"} />
              <InfoItem label="Contact" value={admission.patients?.contact || "—"} />
              <InfoItem label="Ward" value={
                admission.accommodation === "cabin" ? "Cabin" :
                admission.accommodation === "semi_private" ? "Semi Private" : "General"
              } />
              <InfoItem label="Admitted" value={formatDate(admission.admission_date)} />
              <InfoItem
                label="Discharged"
                value={admission.discharge_date ? formatDate(admission.discharge_date) : "Still admitted"}
              />
              <InfoItem label="Days" value={`${days} day${days !== 1 ? "s" : ""}`} />
            </div>
          )}
        </div>

        {/* Balance card */}
        <BalanceBar used={totalUsed} allowed={totalAllowed} alertAllowed={alertAllowed} />

        {/* Hospital Bills Breakdown */}
        <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-4 md:py-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Hospital Bills Breakdown
            </p>
            {isAdminOrCounter && !showOverrideForm && (
              <div className="flex items-center gap-2">
                {hasOverride && (
                  <button
                    onClick={clearOverride}
                    className="text-[11px] text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition"
                  >
                    Clear override
                  </button>
                )}
                <button
                  onClick={() => { setOverrideInput(hasOverride ? admission.total_bill_override.toString() : ""); setOverrideError(""); setShowOverrideForm(true) }}
                  className="text-[12px] font-medium text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full transition"
                >
                  {hasOverride ? "Edit total" : "Set total"}
                </button>
              </div>
            )}
          </div>

          {/* Override form */}
          {showOverrideForm && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
              <p className="text-[12px] text-gray-500">
                Enter the total hospital bill directly. This will override the entry-based calculation.
              </p>
              <input
                type="number"
                placeholder="Total hospital bill (₹)"
                value={overrideInput}
                onChange={e => { setOverrideInput(e.target.value); setOverrideError("") }}
                min="0"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
              />
              {overrideError && <p className="text-[12px] text-red-500">{overrideError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowOverrideForm(false); setOverrideError("") }}
                  className="flex-1 py-2.5 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
                >Cancel</button>
                <button
                  onClick={saveOverride}
                  disabled={overrideSaving}
                  className="flex-1 py-2.5 text-[13px] font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 rounded-xl transition"
                >{overrideSaving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          )}

          {hasOverride ? (
            /* Override mode — just show the lump sum */
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                  Manual total
                </span>
                <span className="text-[11px] text-gray-400">Entry breakdown not available</span>
              </div>
              <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-gray-900">Total Hospital Bill</span>
                <span className="text-[15px] md:text-[17px] font-semibold text-gray-900 tabular-nums">
                  {formatINR(totalUsed)}
                </span>
              </div>
            </div>
          ) : (
            /* Normal mode — show entry breakdown */
            <div className="space-y-2.5">
              <BillRow label="Lab" value={labTotal} />
              <BillRow label="X-Ray" value={xrayTotal} />
              <BillRow label="Pharmacy" value={pharmaTotal} />
              <BillRow label="Counter" value={counterTotal} />
              <div className="pt-2.5 mt-1 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-gray-900">Total Hospital Bill</span>
                <span className="text-[15px] md:text-[17px] font-semibold text-gray-900 tabular-nums">
                  {formatINR(totalUsed)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Counter entries */}
        {showCounter && (
          <CounterSection
            bedFee={bedFee}
            accommodation={admission.accommodation}
            days={days}
            bedRate={wardRate}
            entries={counterEntries}
            admissionId={Number(id)}
            userId={user.id}
            canAdd={canAddCounter && isActive}
            canEdit={canEditAny}
            onRefresh={fetchAll}
          />
        )}

        {/* Lab entries */}
        {showLab && (
          <EntriesSection
            title="Lab Entries"
            dept="lab"
            entries={labEntries}
            admissionId={Number(id)}
            userId={user.id}
            canAdd={canAddLab && isActive}
            canEdit={canEditAny}
            onRefresh={fetchAll}
          />
        )}

        {/* X-Ray entries */}
        {showXray && (
          <EntriesSection
            title="X-Ray Entries"
            dept="xray"
            entries={xrayEntries}
            admissionId={Number(id)}
            userId={user.id}
            canAdd={canAddXray && isActive}
            canEdit={canEditAny}
            onRefresh={fetchAll}
          />
        )}

        {/* Pharma entries */}
        {showPharma && (
          <EntriesSection
            title="Pharmacy Entries"
            dept="pharma"
            entries={pharmaEntries}
            admissionId={Number(id)}
            userId={user.id}
            canAdd={canAddPharma && isActive}
            canEdit={canEditAny}
            onRefresh={fetchAll}
          />
        )}

        {/* Mobile discharge button */}
        {isAdminOrCounter && isActive && (
          <button
            onClick={() => { setDischargeDate(""); setDischargeError(""); setShowDischargeModal(true) }}
            className="md:hidden w-full py-3.5 text-[14px] font-semibold text-white bg-gray-900 hover:bg-gray-700 rounded-xl transition flex items-center justify-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 1h3a1 1 0 011 1v10a1 1 0 01-1 1H9M6 10l3-3-3-3M9 7H1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Discharge Patient
          </button>
        )}

      </main>
    </div>
    </AuthGuard>
  )
}

// ─── COUNTER SECTION ─────────────────────────────────────────────────────────

const CHARGE_TYPES = [
  { value: "nursing",      label: "Nursing Fees" },
  { value: "consultation", label: "Consultation" },
  { value: "misc",         label: "Miscellaneous" },
]

function CounterSection({ bedFee, accommodation, days, bedRate, entries, admissionId, userId, canAdd, canEdit, onRefresh }) {
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  const manualTotal = entries.reduce((s, e) => s + Number(e.amount), 0)
  const grandTotal = bedFee + manualTotal

  async function handleDelete(entry) {
    if (!confirm(`Delete this entry (${formatINR(entry.amount)})?`)) return
    await supabase.from("counter_entries").delete().eq("id", entry.id)
    onRefresh()
  }

  function handleEdit(entry) {
    setEditTarget(entry)
    setShowForm(true)
  }

  function handleSaved() {
    setShowForm(false)
    setEditTarget(null)
    onRefresh()
  }

  return (
    <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 md:px-7 py-4 md:py-5 border-b border-gray-50">
        <div>
          <h3 className="text-[15px] md:text-[17px] font-semibold text-gray-900">Counter Entries</h3>
          <p className="text-[12px] text-gray-400 mt-0.5 tabular-nums">
            Bed fees + {entries.length} manual {entries.length === 1 ? "entry" : "entries"} · {formatINR(grandTotal)}
          </p>
        </div>
        {canAdd && !showForm && (
          <button
            onClick={() => { setEditTarget(null); setShowForm(true) }}
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-900 bg-gray-100 hover:bg-gray-200 px-3.5 py-2 rounded-full transition"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Add
          </button>
        )}
      </div>

      <div className="px-5 md:px-7">
        {/* Auto bed fee row */}
        <div className="flex items-center justify-between py-3.5 border-b border-gray-50">
          <div>
            <p className="text-[14px] md:text-[15px] font-medium text-gray-900">
              {accommodation === "cabin" ? "Cabin / Bed Fees" : "Bed Fees"}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {days}d × {formatINR(bedRate)} · Auto-calculated
            </p>
          </div>
          <span className="text-[14px] md:text-[15px] font-semibold text-gray-900 tabular-nums ml-4">
            {formatINR(bedFee)}
          </span>
        </div>

        {/* Manual entries */}
        {entries.map(entry => (
          <div key={entry.id} className="flex items-start justify-between py-3.5 border-b border-gray-50 last:border-0 group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize shrink-0">
                  {CHARGE_TYPES.find(c => c.value === entry.charge_type)?.label || entry.charge_type}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {formatTime(entry.entry_date)}
                {entry.users?.name ? ` · ${entry.users.name}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <span className="text-[14px] md:text-[15px] font-semibold text-gray-900 tabular-nums">
                {formatINR(entry.amount)}
              </span>
              {canEdit && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(entry)}
                    className="text-[11px] text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
                    className="text-[11px] text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {entries.length === 0 && !showForm && (
          <p className="text-[13px] text-gray-300 py-5 text-center">No manual entries yet</p>
        )}

        {/* Add / edit form */}
        {showForm && (
          <CounterEntryForm
            admissionId={admissionId}
            userId={userId}
            editTarget={editTarget}
            onSave={handleSaved}
            onCancel={() => { setShowForm(false); setEditTarget(null) }}
          />
        )}

        {/* Total */}
        <div className="flex justify-between items-center py-4 border-t border-gray-100 mt-1">
          <span className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest">Total</span>
          <span className="text-[15px] md:text-[17px] font-semibold text-gray-900 tabular-nums">
            {formatINR(grandTotal)}
          </span>
        </div>
      </div>
    </div>
  )
}

function CounterEntryForm({ admissionId, userId, editTarget, onSave, onCancel }) {
  const [chargeType, setChargeType] = useState(editTarget?.charge_type || "nursing")
  const [amount, setAmount] = useState(editTarget?.amount?.toString() || "")
  const [entryDate, setEntryDate] = useState(
    editTarget?.entry_date ? editTarget.entry_date.split("T")[0] : todayStr()
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    if (!amount || isNaN(amount) || Number(amount) <= 0) return setError("Enter a valid amount.")

    setSaving(true)
    if (editTarget) {
      const { error: err } = await supabase
        .from("counter_entries")
        .update({
          charge_type: chargeType,
          amount: Number(amount),
          entry_date: entryDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editTarget.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from("counter_entries")
        .insert({
          admission_id: admissionId,
          charge_type: chargeType,
          amount: Number(amount),
          entry_date: entryDate,
          created_by: userId,
        })
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    onSave()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 md:p-5 mt-3 mb-2 space-y-3">
      <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest">
        {editTarget ? "Edit Entry" : "Add Counter Entry"}
      </p>

      {/* Charge type selector */}
      <div className="flex gap-2">
        {CHARGE_TYPES.map(ct => (
          <button
            key={ct.value}
            type="button"
            onClick={() => setChargeType(ct.value)}
            className={`flex-1 py-2 text-[12px] font-semibold rounded-xl transition ${
              chargeType === ct.value
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-500 hover:border-gray-400"
            }`}
          >
            {ct.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          placeholder="Amount (₹)"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          min="0"
          step="0.01"
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
        />
        <input
          type="date"
          value={entryDate}
          onChange={e => setEntryDate(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
        />
      </div>

      {error && <p className="text-[12px] text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-[13px] font-semibold py-2.5 rounded-xl transition"
        >
          {saving ? "Saving…" : editTarget ? "Save Changes" : "Add Entry"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-[13px] font-medium text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function BillRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-gray-500">{label}</span>
      <span className="text-[13px] font-medium text-gray-900 tabular-nums">{formatINR(value)}</span>
    </div>
  )
}

function editInputClass() {
  return "w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
}

function EditField({ label, required, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-[10px] md:text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-[14px] md:text-[15px] font-medium text-gray-900">{value}</p>
    </div>
  )
}