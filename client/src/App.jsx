import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'

import { GuestRoute } from './components/GuestRoute.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { AccountPage } from './pages/AccountPage.jsx'
import { AuctionDetailsPage } from './pages/AuctionDetailsPage.jsx'
import { AuctionDiscoveryPage } from './pages/AuctionDiscoveryPage.jsx'
import { CreateAuctionPage } from './pages/CreateAuctionPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { RegisterPage } from './pages/RegisterPage.jsx'
import { SellerDashboardPage } from './pages/SellerDashboardPage.jsx'

function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/auctions" element={<AuctionDiscoveryPage />} />
        <Route path="/auctions/:auctionId" element={<AuctionDetailsPage />} />
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<AccountPage />} />
          <Route path="/account" element={<Navigate to="/profile" replace />} />
          <Route path="/dashboard" element={<SellerDashboardPage />} />
          <Route path="/auctions/new" element={<CreateAuctionPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/auctions" replace />} />
        <Route path="*" element={<Navigate to="/auctions" replace />} />
      </Routes>
    </>
  )
}

export default App
