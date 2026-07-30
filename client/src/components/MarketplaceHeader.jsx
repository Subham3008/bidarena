import { CircleUserRound, Gavel, Plus } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth.js'

function navClassName({ isActive }) {
  return [
    'relative inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] border px-1 text-xs font-semibold transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 md:shrink-0 md:gap-2 md:px-3 md:text-sm',
    isActive
      ? 'border-emerald-200 bg-[var(--color-green-soft)] text-[var(--color-green-hover)] shadow-[inset_0_-2px_0_var(--color-green-primary)]'
      : 'border-transparent text-stone-600 hover:border-stone-200 hover:bg-stone-50 hover:text-stone-950',
  ].join(' ')
}

export function MarketplaceHeader() {
  const { user, isRestoringSession } = useAuth()
  const accountLabel = user?.displayName?.trim() || 'Account'

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_10px_rgb(28_25_23_/_0.04)]">
      <div className="app-container flex min-h-16 flex-wrap items-center gap-x-3 md:flex-nowrap md:gap-5">
        <Link
          to="/"
          className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] pr-1 text-stone-950 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
          aria-label="BidArena home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--color-green-primary)] text-white shadow-sm transition group-hover:bg-[var(--color-green-hover)]">
            <Gavel size={18} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-[-0.025em]">
            Bid<span className="text-[var(--color-green-primary)]">Arena</span>
          </span>
        </Link>

        <nav
          className={`order-3 grid w-full min-w-0 gap-1 border-t border-stone-100 py-2 md:order-none md:ml-auto md:flex md:w-auto md:items-center md:gap-2 md:border-0 ${
            user ? 'grid-cols-4' : 'grid-cols-2'
          }`}
          aria-label="Primary navigation"
        >
          <NavLink to="/auctions" end className={navClassName}>
            Browse
          </NavLink>
          {user ? (
            <>
              <NavLink to="/dashboard" className={navClassName}>
                Dashboard
              </NavLink>
              <NavLink
                to="/auctions/new"
                className={navClassName}
              >
                <Plus size={16} aria-hidden="true" />
                <span className="md:hidden">Create</span>
                <span className="hidden md:inline">Create auction</span>
              </NavLink>
            </>
          ) : null}
          {!isRestoringSession ? (
            <NavLink
              to={user ? '/profile' : '/login'}
              className={navClassName}
            >
              <CircleUserRound size={17} aria-hidden="true" />
              {user ? (
                <>
                  <span className="sm:hidden">Account</span>
                  <span className="hidden max-w-36 truncate sm:inline">
                    {accountLabel}
                  </span>
                </>
              ) : (
                'Sign in'
              )}
            </NavLink>
          ) : null}
        </nav>
      </div>
    </header>
  )
}
