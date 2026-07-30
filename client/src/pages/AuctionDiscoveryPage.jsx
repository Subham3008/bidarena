import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { AuctionCard } from '../components/AuctionCard.jsx'
import { AuctionSkeleton } from '../components/AuctionSkeleton.jsx'
import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { fetchAuctions } from '../services/auctions.js'
import { getApiErrorMessage } from '../services/api.js'

const STATUS_FILTERS = [
  { label: 'All auctions', value: '' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Live now', value: 'ACTIVE' },
  { label: 'Completed', value: 'COMPLETED' },
]

const INITIAL_FILTERS = {
  status: '',
  search: '',
  page: 1,
  limit: 12,
  sort: 'newest',
}

export function AuctionDiscoveryPage() {
  const { user } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState(INITIAL_FILTERS)

  const auctionsQuery = useQuery({
    queryKey: ['auctions', filters],
    queryFn: ({ signal }) => fetchAuctions(filters, signal),
    placeholderData: keepPreviousData,
  })

  const auctions = auctionsQuery.data?.auctions ?? []
  const pagination = auctionsQuery.data?.pagination
  const hasAppliedFilters = Boolean(filters.search || filters.status)

  function updateFilters(changes) {
    setFilters((current) => ({
      ...current,
      ...changes,
      page: changes.page ?? 1,
    }))
  }

  function handleSearch(event) {
    event.preventDefault()
    updateFilters({ search: searchInput.trim() })
  }

  function clearFilters() {
    setSearchInput('')
    setFilters((current) => ({
      ...INITIAL_FILTERS,
      limit: current.limit,
      sort: current.sort,
    }))
  }

  return (
    <div className="app-shell">
      <MarketplaceHeader />

      <main className="app-container py-9 sm:py-12 lg:py-14">
        <header className="flex flex-col gap-6 border-b border-[var(--color-border)] pb-8 sm:flex-row sm:items-end sm:justify-between lg:pb-10">
          <div>
            <p className="page-kicker">BidArena marketplace</p>
            <h1 className="page-title mt-2">Find your next auction</h1>
            <p className="page-description mt-3">
              Explore upcoming listings, join live bidding, and review completed
              auctions in one clear marketplace.
            </p>
          </div>
          <Link
            to={user ? '/auctions/new' : '/login'}
            className="btn-primary w-full shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 sm:w-auto"
          >
            {user ? 'Create auction' : 'Sign in to sell'}
          </Link>
        </header>

        <section
          className="surface-card mt-7 p-5 sm:p-6"
          aria-labelledby="marketplace-filters"
        >
          <div className="mb-5 flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-green-soft)] text-[var(--color-green-primary)]">
              <SlidersHorizontal size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 id="marketplace-filters" className="font-bold text-stone-950">
                Search and filter
              </h2>
              <p className="mt-0.5 text-sm text-stone-500">
                Narrow the marketplace by title, status, or ordering.
              </p>
            </div>
          </div>

          <form
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_15rem] lg:items-end"
            onSubmit={handleSearch}
          >
            <label className="field-label min-w-0">
              Search auctions
              <span className="relative mt-2 block">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by auction title"
                  className="field-control !pl-10 text-sm font-normal"
                />
              </span>
            </label>
            <button
              type="submit"
              className="btn-secondary w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 lg:w-auto"
            >
              Search
            </button>
            <label className="field-label">
              Sort results
              <select
                value={filters.sort}
                onChange={(event) => updateFilters({ sort: event.target.value })}
                className="field-control mt-2 text-sm font-normal"
              >
                <option value="newest">Newest first</option>
                <option value="endingSoon">Ending soon</option>
                <option value="priceLow">Price: low to high</option>
                <option value="priceHigh">Price: high to low</option>
              </select>
            </label>
          </form>

          <div className="mt-5 flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="soft-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label="Auction status"
            >
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status.value || 'all'}
                  type="button"
                  aria-pressed={filters.status === status.value}
                  onClick={() => updateFilters({ status: status.value })}
                  className={`min-h-10 shrink-0 whitespace-nowrap rounded-[var(--radius-sm)] border px-3.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 ${
                    filters.status === status.value
                      ? 'border-[var(--color-green-primary)] bg-[var(--color-green-soft)] text-[var(--color-green-hover)]'
                      : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:text-stone-950'
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>
            {hasAppliedFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] sm:justify-start"
              >
                <X size={15} aria-hidden="true" /> Clear filters
              </button>
            ) : null}
          </div>
        </section>

        {pagination && !auctionsQuery.isPending ? (
          <div className="mt-7 flex min-h-7 flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-stone-600" aria-live="polite">
              <span className="font-bold text-stone-950 tabular-nums">
                {pagination.totalItems}
              </span>{' '}
              {pagination.totalItems === 1 ? 'auction' : 'auctions'} found
              {filters.search ? ` for “${filters.search}”` : ''}
            </p>
            {auctionsQuery.isFetching ? (
              <p
                className="text-sm font-semibold text-[var(--color-green-primary)]"
                role="status"
              >
                Updating results…
              </p>
            ) : null}
          </div>
        ) : null}

        {auctionsQuery.isPending ? (
          <div className="mt-8" role="status" aria-label="Loading auctions">
            <span className="sr-only">Loading marketplace auctions…</span>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <AuctionSkeleton key={index} />
              ))}
            </div>
          </div>
        ) : null}

        {auctionsQuery.isError ? (
          <section
            className="surface-card mt-10 px-5 py-10 text-center"
            role="alert"
          >
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-red-50 text-red-700">
              <CircleAlert size={21} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-stone-950">
              Auctions could not be loaded
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
              {getApiErrorMessage(
                auctionsQuery.error,
                'Check your connection and try again.',
              )}
            </p>
            <button
              type="button"
              onClick={() => auctionsQuery.refetch()}
              className="btn-primary mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </section>
        ) : null}

        {auctionsQuery.isSuccess && auctions.length === 0 ? (
          <section className="surface-card mt-10 px-5 py-12 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-stone-100 text-stone-500">
              <Search size={21} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold">
              {hasAppliedFilters
                ? 'No matching auctions'
                : 'No auctions available yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
              {hasAppliedFilters
                ? 'Try a different title or widen the status filter to see more listings.'
                : 'The marketplace is ready for its next listing. Create an auction to get started.'}
            </p>
            {hasAppliedFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="btn-secondary mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
              >
                Clear filters
              </button>
            ) : (
              <Link
                to={user ? '/auctions/new' : '/register'}
                className="btn-primary mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
              >
                {user ? 'Create an auction' : 'Create an account'}
              </Link>
            )}
          </section>
        ) : null}

        {auctionsQuery.isSuccess && auctions.length > 0 ? (
          <>
            <div
              className={`mt-6 grid gap-6 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
                auctionsQuery.isFetching ? 'opacity-70' : ''
              }`}
              aria-busy={auctionsQuery.isFetching}
            >
              {auctions.map((auction) => (
                <AuctionCard key={auction._id} auction={auction} />
              ))}
            </div>

            {pagination && pagination.totalPages > 1 ? (
              <nav
                className="surface-card mt-10 flex items-center justify-between gap-3 p-3 sm:p-4"
                aria-label="Auction pages"
              >
                <button
                  type="button"
                  disabled={pagination.page <= 1 || auctionsQuery.isFetching}
                  onClick={() => updateFilters({ page: pagination.page - 1 })}
                  className="btn-secondary min-w-0 px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 sm:px-4"
                  aria-label="Previous auction page"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">Previous</span>
                </button>
                <p className="text-center text-sm font-medium text-stone-600">
                  Page{' '}
                  <span className="font-bold text-stone-950 tabular-nums">
                    {pagination.page}
                  </span>{' '}
                  of <span className="tabular-nums">{pagination.totalPages}</span>
                </p>
                <button
                  type="button"
                  disabled={
                    pagination.page >= pagination.totalPages ||
                    auctionsQuery.isFetching
                  }
                  onClick={() => updateFilters({ page: pagination.page + 1 })}
                  className="btn-secondary min-w-0 px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 sm:px-4"
                  aria-label="Next auction page"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </nav>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  )
}
