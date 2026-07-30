import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, SlidersHorizontal, X } from 'lucide-react'
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
    <div className="min-h-screen overflow-x-hidden bg-stone-100 text-stone-950">
      <MarketplaceHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              BidArena marketplace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Find your next auction
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-stone-600">
              Explore upcoming listings, join live bidding, and review completed
              auctions in one clear marketplace.
            </p>
          </div>
          <Link
            to={user ? '/auctions/new' : '/login'}
            className="inline-flex w-fit shrink-0 items-center justify-center rounded-sm bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          >
            {user ? 'Create auction' : 'Sign in to sell'}
          </Link>
        </header>

        <section
          className="mt-6 rounded-md border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
          aria-labelledby="marketplace-filters"
        >
          <div className="mb-4 flex items-center gap-2">
            <SlidersHorizontal
              size={17}
              className="text-stone-500"
              aria-hidden="true"
            />
            <h2 id="marketplace-filters" className="text-sm font-semibold">
              Search and filter
            </h2>
          </div>

          <form
            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_12rem]"
            onSubmit={handleSearch}
          >
            <label className="relative min-w-0">
              <span className="sr-only">Search auctions by title</span>
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-3 text-stone-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search auction titles"
                className="w-full rounded-sm border border-stone-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              />
            </label>
            <button
              type="submit"
              className="rounded-sm border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-emerald-700 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            >
              Search
            </button>
            <label>
              <span className="sr-only">Sort auctions</span>
              <select
                value={filters.sort}
                onChange={(event) => updateFilters({ sort: event.target.value })}
                className="w-full rounded-sm border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              >
                <option value="newest">Newest first</option>
                <option value="endingSoon">Ending soon</option>
                <option value="priceLow">Price: low to high</option>
                <option value="priceHigh">Price: high to low</option>
              </select>
            </label>
          </form>

          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status.value || 'all'}
                type="button"
                aria-pressed={filters.status === status.value}
                onClick={() => updateFilters({ status: status.value })}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ${
                  filters.status === status.value
                    ? 'bg-emerald-800 text-white'
                    : 'bg-stone-50 text-stone-600 ring-1 ring-inset ring-stone-300 hover:text-stone-950'
                }`}
              >
                {status.label}
              </button>
            ))}
            {hasAppliedFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-medium text-stone-600 hover:text-stone-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                <X size={15} aria-hidden="true" /> Clear
              </button>
            ) : null}
          </div>
        </section>

        {pagination && !auctionsQuery.isPending ? (
          <div className="mt-6 flex min-h-6 flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
            <p aria-live="polite">
              {pagination.totalItems}{' '}
              {pagination.totalItems === 1 ? 'auction' : 'auctions'} found
              {filters.search ? ` for “${filters.search}”` : ''}
            </p>
            {auctionsQuery.isFetching ? (
              <p className="text-emerald-800" role="status">
                Updating results…
              </p>
            ) : null}
          </div>
        ) : null}

        {auctionsQuery.isPending ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <AuctionSkeleton key={index} />
            ))}
          </div>
        ) : null}

        {auctionsQuery.isError ? (
          <section
            className="mt-10 rounded-md border border-red-200 bg-red-50 p-6 text-center"
            role="alert"
          >
            <h2 className="font-semibold text-red-900">
              Auctions could not be loaded
            </h2>
            <p className="mt-2 text-sm text-red-700">
              {getApiErrorMessage(
                auctionsQuery.error,
                'Check your connection and try again.',
              )}
            </p>
            <button
              type="button"
              onClick={() => auctionsQuery.refetch()}
              className="mt-4 rounded-sm bg-red-800 px-4 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </section>
        ) : null}

        {auctionsQuery.isSuccess && auctions.length === 0 ? (
          <section className="mt-10 rounded-md border border-stone-200 bg-white px-5 py-12 text-center">
            <h2 className="text-lg font-semibold">No matching auctions</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
              Try a different title or widen the status filter to see more
              listings.
            </p>
            {hasAppliedFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:border-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
              >
                Clear filters
              </button>
            ) : null}
          </section>
        ) : null}

        {auctionsQuery.isSuccess && auctions.length > 0 ? (
          <>
            <div
              className={`mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
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
                className="mt-10 flex items-center justify-between border-t border-stone-200 pt-5"
                aria-label="Auction pages"
              >
                <button
                  type="button"
                  disabled={pagination.page <= 1 || auctionsQuery.isFetching}
                  onClick={() => updateFilters({ page: pagination.page - 1 })}
                  className="rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-semibold transition hover:border-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  Previous
                </button>
                <p className="text-sm text-stone-600">
                  Page {pagination.page} of {pagination.totalPages}
                </p>
                <button
                  type="button"
                  disabled={
                    pagination.page >= pagination.totalPages ||
                    auctionsQuery.isFetching
                  }
                  onClick={() => updateFilters({ page: pagination.page + 1 })}
                  className="rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-semibold transition hover:border-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  )
}
