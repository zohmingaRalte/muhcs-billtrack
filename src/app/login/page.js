"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { useUser } from "@/app/context/UserContext"

export default function LoginPage() {
  const router = useRouter()
  const { setUser } = useUser()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError("")

    if (!username.trim()) { setError("Username is required."); return }
    if (!password) { setError("Password is required."); return }

    setLoading(true)

    const { data, error: dbErr } = await supabase
      .from("users")
      .select("id, name, role, password")
      .eq("name", username.trim())
      .single()

    if (dbErr || !data) {
      setError("Username not found.")
      setLoading(false)
      return
    }

    if (data.password !== password) {
      setError("Incorrect password.")
      setLoading(false)
      return
    }

    // Store user (without password)
    setUser({ id: data.id, name: data.name, role: data.role })
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col items-center justify-center px-5">

      {/* Logo / branding */}
      <div className="text-center mb-10">
        <img
          src="/logo.jpg"
          alt="Mercy Hospital"
          className="h-20 w-20 rounded-full object-cover mb-4 shadow-sm mx-auto"
        />
        <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-1">
          Mercy Hospital
        </p>
        <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">
          MUHCS Tracker
        </h1>
      </div>

      {/* Login card */}
      <div className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] shadow-sm px-7 py-8">
        <h2 className="text-[17px] font-semibold text-gray-900 mb-6">Sign in</h2>

        <form onSubmit={handleLogin} className="space-y-4">

          {/* Username */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
              Username
            </label>
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={e => { setUsername(e.target.value); setError("") }}
              autoComplete="username"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError("") }}
                autoComplete="current-password"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pr-11 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[12px] text-red-500 font-medium">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 text-[14px] font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 rounded-xl transition mt-2"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

        </form>
      </div>

      <p className="text-[11px] text-gray-300 mt-8">
        MUHCS Billing Tracker · Mercy Hospital
      </p>
    </div>
  )
}