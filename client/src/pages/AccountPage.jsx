import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth.js'
import { getApiErrorMessage } from '../services/api.js'

export function AccountPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleLogout() {
    setIsLoggingOut(true)
    setErrorMessage('')

    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, 'Logout failed. Please try again.'),
      )
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-12 text-stone-950">
      <section className="mx-auto max-w-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-emerald-800">
          BidArena
        </p>
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-stone-500">Signed in as</p>
            <h1 className="mt-1 text-2xl font-semibold">{user.displayName}</h1>
            <p className="mt-1 text-stone-600">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 transition hover:border-stone-400 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>

        {errorMessage ? (
          <p
            className="mt-5 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </section>
    </main>
  )
}
