"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/app/context/UserContext"

export default function AuthGuard({ children }) {
  const { user, loading } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login")
    }
  }, [user, loading])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <p className="text-gray-300 text-[14px]">Loading…</p>
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}