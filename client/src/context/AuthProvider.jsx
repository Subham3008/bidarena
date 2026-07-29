import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '../services/api.js'
import { AuthContext } from './AuthContext.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isRestoringSession, setIsRestoringSession] = useState(true)

  useEffect(() => {
    let isActive = true

    async function restoreSession() {
      try {
        const response = await api.get('/auth/me')

        if (isActive) {
          setUser(response.data.data.user)
        }
      } catch {
        if (isActive) {
          setUser(null)
        }
      } finally {
        if (isActive) {
          setIsRestoringSession(false)
        }
      }
    }

    restoreSession()

    return () => {
      isActive = false
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const response = await api.post('/auth/login', credentials)
    setUser(response.data.data.user)
    return response.data.data.user
  }, [])

  const register = useCallback(async (details) => {
    const response = await api.post('/auth/register', details)
    setUser(response.data.data.user)
    return response.data.data.user
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout')
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (profile) => {
    const response = await api.patch('/auth/me', profile)
    const updatedUser = response.data.data.user
    setUser(updatedUser)
    return updatedUser
  }, [])

  const value = useMemo(
    () => ({
      user,
      isRestoringSession,
      login,
      register,
      updateProfile,
      logout,
    }),
    [isRestoringSession, login, logout, register, updateProfile, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
