import { ArrowRight, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'

export function NotFoundPage() {
  return (
    <div className="app-shell">
      <MarketplaceHeader />
      <main className="app-container grid min-h-[calc(100vh-4rem)] place-items-center py-16 text-center">
        <section className="max-w-xl">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-[var(--color-green-soft)] text-[var(--color-green-primary)]">
            <Compass size={25} aria-hidden="true" />
          </span>
          <p className="page-kicker mt-6">Page not found</p>
          <h1 className="page-title mt-2">This route is outside the arena.</h1>
          <p className="page-description mx-auto mt-4">
            The page may have moved, or the address may be incomplete. Return
            to the marketplace to keep browsing.
          </p>
          <Link to="/auctions" className="btn-primary mt-7">
            Browse auctions
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </main>
    </div>
  )
}
