import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth.js'

export function GuestRoute() {
  const { user, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 text-sm text-stone-600">
        Restoring your session…
      </main>
    )
  }

  return user ? <Navigate to="/account" replace /> : <Outlet />
}
