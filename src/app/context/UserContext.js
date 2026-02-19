"use client"

import { createContext, useContext, useState, useEffect } from "react"

const UserContext = createContext(null)

const STORAGE_KEY = "muhcs_user"

export function UserProvider({ children }) {
  const [user, setUserState] = useState(null)
  const [loading, setLoading] = useState(true)

  // Load user from localStorage on app start
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setUserState(JSON.parse(stored))
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY)
    }
    setLoading(false)
  }, [])

  function setUser(u) {
    setUserState(u)
    if (u) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  function logout() {
    setUser(null)
  }

  return (
    <UserContext.Provider value={{ user, setUser, logout, loading }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error("useUser must be used inside UserProvider")
  return ctx
}