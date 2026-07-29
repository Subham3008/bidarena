import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { AuctionCard } from '../components/AuctionCard.jsx'
import { AuctionSkeleton } from '../components/AuctionSkeleton.jsx'
import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { fetchAuctions } from '../services/auctions.js'

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Live', value: 'ACTIVE' },
  { label: 'Completed', value: 'COMPLETED' },
]

export function AuctionDiscoveryPage() {
  const { user } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({
    status: '',
    search: '',
    page: 1,
    limit: 12,
    sort: 'newest',
  })

  const auctionsQuery = useQuery({
    queryKey: ['auctions', filters],
    queryFn: ({ signal }) => fetchAuctions(filters, signal),
  })

  const auctions = auctionsQuery.data?.auctions ?? []
  const pagination = auctionsQuery.data?.pagination

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

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <MarketplaceHeader />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Marketplace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Discover auctions
            </h1>
            <p className="mt-2 max-w-2xl text-stone-600">
              Find upcoming listings, active auctions, and completed sales.
            </p>
          </div>
          <Link
            to={user ? '/auctions/new' : '/login'}
            className="inline-flex w-fit items-center justify-center rounded-sm bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          >
            Create auction
          </Link>
        </div>

        <section className="mt-8 border-y border-stone-200 py-5">
          <form
            className="flex flex-col gap-3 md:flex-row"
            onSubmit={handleSearch}
          >
            <label className="relative flex-1">
              <span className="sr-only">Search auctions</span>
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-3 text-stone-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search by auction title"
                className="w-full rounded-sm border border-stone-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
              />
            </label>
            <button
              type="submit"
              className="rounded-sm border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-800 hover:border-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              Search
            </button>
            <label>
              <span className="sr-only">Sort auctions</span>
              <select
                value={filters.sort}
                onChange={(event) => updateFilters({ sort: event.target.value })}
                className="w-full rounded-sm border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 md:w-44"
              >
                <option value="newest">Newest</option>
                <option value="endingSoon">Ending soon</option>
                <option value="priceLow">Price: low to high</option>
                <option value="priceHigh">Price: high to low</option>
              </select>
            </label>
          </form>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status.label}
                type="button"
                onClick={() => updateFilters({ status: status.value })}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 ${
                  filters.status === status.value
                    ? 'bg-emerald-800 text-white'
                    : 'bg-white text-stone-600 ring-1 ring-inset ring-stone-300 hover:text-stone-950'
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>
        </section>

        {auctionsQuery.isPending ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <AuctionSkeleton key={index} />
            ))}
          </div>
        ) : null}

        {auctionsQuery.isError ? (
          <section className="mt-12 border border-red-200 bg-red-50 p-6 text-center">
            <h2 className="font-semibold text-red-900">
              Auctions could not be loaded
            </h2>
            <p className="mt-2 text-sm text-red-700">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => auctionsQuery.refetch()}
              className="mt-4 rounded-sm bg-red-800 px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
            >
              Try again
            </button>
          </section>
        ) : null}

        {auctionsQuery.isSuccess && auctions.length === 0 ? (
          <section className="mt-12 border-y border-stone-200 py-12 text-center">
            <h2 className="text-lg font-semibold">No auctions found</h2>
            <p className="mt-2 text-sm text-stone-600">
              Try another search or status filter.
            </p>
          </section>
        ) : null}

        {auctionsQuery.isSuccess && auctions.length > 0 ? (
          <>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {auctions.map((auction) => (
                <AuctionCard key={auction._id} auction={auction} />
              ))}
            </div>

            <nav
              className="mt-8 flex items-center justify-between border-t border-stone-200 pt-5"
              aria-label="Auction pages"
            >
              <button
                type="button"
                disabled={pagination.page <= 1 || auctionsQuery.isFetching}
                onClick={() => updateFilters({ page: pagination.page - 1 })}
                className="rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-stone-400"
              >
                Previous
              </button>
              <p className="text-sm text-stone-600">
                Page {pagination.page} of {Math.max(pagination.totalPages, 1)}
              </p>
              <button
                type="button"
                disabled={
                  pagination.page >= pagination.totalPages ||
                  auctionsQuery.isFetching
                }
                onClick={() => updateFilters({ page: pagination.page + 1 })}
                className="rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-stone-400"
              >
                Next
              </button>
            </nav>
          </>
        ) : null}
      </main>
    </div>
  )
}
