import { Link, NavLink } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth.js'

function navClassName({ isActive }) {
  return [
    'rounded-sm px-1 py-1 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2',
    isActive ? 'text-emerald-800' : 'text-stone-600 hover:text-stone-950',
  ].join(' ')
}

export function MarketplaceHeader() {
  const { user, isRestoringSession } = useAuth()

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="shrink-0 rounded-sm text-base font-semibold tracking-tight text-stone-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          aria-label="BidArena home"
        >
          Bid<span className="text-emerald-800">Arena</span>
        </Link>

        <nav className="flex min-w-0 items-center gap-2 sm:gap-5" aria-label="Primary">
          <NavLink to="/auctions" className={navClassName}>
            Browse
          </NavLink>
          {user ? (
            <>
              <NavLink to="/dashboard" className={navClassName}>
                Dashboard
              </NavLink>
              <NavLink
                to="/auctions/new"
                className={({ isActive }) =>
                  `${navClassName({ isActive })} hidden md:block`
                }
              >
                Create
              </NavLink>
            </>
          ) : null}
          {!isRestoringSession ? (
            <NavLink
              to={user ? '/profile' : '/login'}
              className={navClassName}
            >
              {user ? 'Profile' : 'Sign in'}
            </NavLink>
          ) : null}
        </nav>
      </div>
    </header>
  )
}
