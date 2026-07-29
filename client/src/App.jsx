import { Navigate, Route, Routes } from 'react-router-dom'

import { GuestRoute } from './components/GuestRoute.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { AccountPage } from './pages/AccountPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { RegisterPage } from './pages/RegisterPage.jsx'

function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/account" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
