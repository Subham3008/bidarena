import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth.js'
import { FullPageLoadingState } from './FullPageLoadingState.jsx'

export function GuestRoute() {
  const { user, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return <FullPageLoadingState message="Restoring your session…" />
  }

  return user ? <Navigate to="/account" replace /> : <Outlet />
}
