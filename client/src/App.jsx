import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'

import { GuestRoute } from './components/GuestRoute.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { AccountPage } from './pages/AccountPage.jsx'
import { AuctionDetailsPage } from './pages/AuctionDetailsPage.jsx'
import { AuctionDiscoveryPage } from './pages/AuctionDiscoveryPage.jsx'
import { CreateAuctionPage } from './pages/CreateAuctionPage.jsx'
import { EditAuctionPage } from './pages/EditAuctionPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { RegisterPage } from './pages/RegisterPage.jsx'
import { SellerDashboardPage } from './pages/SellerDashboardPage.jsx'

const LandingPage = lazy(() =>
  import('./pages/LandingPage.jsx').then((module) => ({
    default: module.LandingPage,
  })),
)

function LandingFallback() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-stone-100 text-sm font-medium text-stone-600"
      role="status"
    >
      Loading BidArena…
    </div>
  )
}

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
          <Route path="/auctions/:auctionId/edit" element={<EditAuctionPage />} />
        </Route>
        <Route
          path="/"
          element={
            <Suspense fallback={<LandingFallback />}>
              <LandingPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/auctions" replace />} />
      </Routes>
    </>
  )
}

export default App
