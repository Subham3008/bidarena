import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth.js'
import { FullPageLoadingState } from './FullPageLoadingState.jsx'

export function ProtectedRoute() {
  const { user, isRestoringSession } = useAuth()
  const location = useLocation()

  if (isRestoringSession) {
    return <FullPageLoadingState message="Restoring your session…" />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
