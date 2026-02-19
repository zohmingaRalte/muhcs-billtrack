"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { useUser } from "@/app/context/UserContext"
import AuthGuard from "@/app/context/AuthGuard"

export default function NewPatientPage() {
  const router = useRouter()
  const { user } = useUser()

  // Patient fields
  const [fullName, setFullName] = useState("")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("male")
  const [contact, setContact] = useState("")

  // Admission fields
  const [admissionDate, setAdmissionDate] = useState("")
  const [accommodation, setAccommodation] = useState("general")

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!fullName.trim()) e.fullName = "Full name is required."
    if (!age || isNaN(age) || Number(age) <= 0 || Number(age) > 120)
      e.age = "Enter a valid age."
    if (!admissionDate) e.admissionDate = "Admission date is required."
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const e2 = validate()
    if (Object.keys(e2).length > 0) { setErrors(e2); return }

    setSaving(true)
    setErrors({})

    // 1. Insert patient
    const { data: patient, error: patientErr } = await supabase
      .from("patients")
      .insert({
        full_name: fullName.trim(),
        age: Number(age),
        gender,
        contact: contact.trim() || null,
      })
      .select()
      .single()

    if (patientErr) {
      setErrors({ submit: patientErr.message })
      setSaving(false)
      return
    }

    // 2. Insert admission
    const { error: admErr } = await supabase
      .from("admissions")
      .insert({
        patient_id: patient.id,
        admission_date: admissionDate,
        accommodation,
        status: "admitted",
      })

    if (admErr) {
      setErrors({ submit: admErr.message })
      setSaving(false)
      return
    }

    setSaving(false)
    router.push("/")
  }

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
              <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">
                New Admission
              </p>
              <h1 className="text-[18px] md:text-[22px] font-semibold text-gray-900 tracking-tight leading-none">
                Add Patient
              </h1>
            </div>
          </div>
          <div className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-semibold">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 md:px-0 py-8 md:py-12">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Patient Info */}
          <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5 md:py-6">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-5">
              Patient Info
            </p>

            <div className="space-y-4">
              <Field
                label="Full Name"
                required
                error={errors.fullName}
              >
                <input
                  type="text"
                  placeholder="e.g. Lalthansanga Pachuau"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className={inputClass(errors.fullName)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Age" required error={errors.age}>
                  <input
                    type="number"
                    placeholder="e.g. 45"
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    min="1"
                    max="120"
                    className={inputClass(errors.age)}
                  />
                </Field>

                <Field label="Gender">
                  <div className="grid grid-cols-2 gap-2">
                    {["male", "female"].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGender(g)}
                        className={`py-3 rounded-xl border-2 text-[13px] font-semibold capitalize transition ${
                          gender === g
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <Field label="Contact Number">
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  className={inputClass()}
                />
              </Field>
            </div>
          </div>

          {/* Admission Details */}
          <div className="bg-white rounded-xl md:rounded-2xl border border-black/[0.06] shadow-sm px-5 md:px-7 py-5 md:py-6">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-5">
              Admission Details
            </p>

            <div className="space-y-4">
              <Field label="Admission Date" required error={errors.admissionDate}>
                <input
                  type="date"
                  value={admissionDate}
                  onChange={e => setAdmissionDate(e.target.value)}
                  className={inputClass(errors.admissionDate)}
                />
              </Field>

              <Field label="Ward Type">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "general",      label: "General",      sub: `₹400 / day` },
                    { value: "semi_private", label: "Semi Private", sub: `₹800 / day` },
                    { value: "cabin",        label: "Cabin",        sub: `₹1,500 / day` },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAccommodation(opt.value)}
                      className={`text-left px-4 py-3.5 rounded-xl border-2 transition ${
                        accommodation === opt.value
                          ? "border-gray-900 bg-gray-900"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <p className={`text-[14px] font-semibold ${accommodation === opt.value ? "text-white" : "text-gray-900"}`}>
                        {opt.label}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${accommodation === opt.value ? "text-gray-300" : "text-gray-400"}`}>
                        {opt.sub}
                      </p>
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>

          {/* Submit error */}
          {errors.submit && (
            <p className="text-[13px] text-red-500 px-1">{errors.submit}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex-1 py-3.5 text-[14px] font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3.5 text-[14px] font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 rounded-xl transition"
            >
              {saving ? "Saving…" : "Admit Patient"}
            </button>
          </div>

        </form>
      </main>
    </div>
    </AuthGuard>
  )
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function inputClass(error) {
  return `w-full bg-white border ${error ? "border-red-300 focus:ring-red-200" : "border-gray-200 focus:border-gray-400 focus:ring-gray-900/10"} rounded-xl px-4 py-3 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 transition`
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-[11px] text-red-500 mt-1">{error}</p>
      )}
    </div>
  )
}