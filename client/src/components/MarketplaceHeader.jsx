import { Link, NavLink } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth.js'

function navClassName({ isActive }) {
  return [
    'text-sm font-medium transition',
    isActive ? 'text-emerald-800' : 'text-stone-600 hover:text-stone-950',
  ].join(' ')
}

export function MarketplaceHeader() {
  const { user, isRestoringSession } = useAuth()

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          to="/auctions"
          className="text-base font-semibold tracking-tight text-stone-950"
        >
          Bid<span className="text-emerald-800">Arena</span>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-6" aria-label="Primary">
          <NavLink to="/auctions" className={navClassName}>
            Browse
          </NavLink>
          {user ? (
            <NavLink to="/auctions/new" className={navClassName}>
              Create
            </NavLink>
          ) : null}
          {!isRestoringSession ? (
            <NavLink
              to={user ? '/account' : '/login'}
              className={navClassName}
            >
              {user ? 'Account' : 'Sign in'}
            </NavLink>
          ) : null}
        </nav>
      </div>
    </header>
  )
}
