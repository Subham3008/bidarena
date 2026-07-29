import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { fetchOwnedAuctions } from '../services/auctions.js'

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Completed', value: 'COMPLETED' },
]

const STATUS_STYLES = {
  UPCOMING: 'bg-amber-50 text-amber-800 ring-amber-200',
  ACTIVE: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  COMPLETED: 'bg-stone-100 text-stone-700 ring-stone-200',
}

const STATUS_LABELS = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
}

const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
})

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Unavailable'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function DashboardSkeleton() {
  return (
    <div className="mt-6 grid animate-pulse gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-80 border border-stone-200 bg-white" />
      ))}
    </div>
  )
}

function SellerAuctionCard({ auction }) {
  const [imageFailed, setImageFailed] = useState(false)
  const displayedBid = auction.currentBid ?? auction.startBid

  return (
    <article className="overflow-hidden border border-stone-200 bg-white">
      <div className="flex gap-4 border-b border-stone-100 p-4">
        <div className="h-20 w-24 shrink-0 overflow-hidden bg-stone-100">
          {!imageFailed ? (
            <img
              src={auction.image}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[auction.status]}`}
          >
            {STATUS_LABELS[auction.status]}
          </span>
          <h2 className="mt-2 truncate font-semibold">{auction.title}</h2>
        </div>
      </div>

      <div className="p-4">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">
              {auction.bidCount ? 'Current bid' : 'Starting bid'}
            </dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {numberFormatter.format(displayedBid)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Bids</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{auction.bidCount}</dd>
          </div>
        </dl>

        <div className="mt-5 space-y-2 border-t border-stone-100 pt-4 text-sm text-stone-600">
          <p className="flex items-start gap-2">
            <CalendarClock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>Starts {formatDate(auction.startAt)}</span>
          </p>
          <p className="pl-6">Ends {formatDate(auction.endAt)}</p>
        </div>

        {auction.status === 'COMPLETED' ? (
          <div className="mt-4 border-t border-stone-100 pt-4 text-sm">
            <p className="text-stone-500">
              Winner: <span className="font-medium text-stone-800">{auction.winner?.name ?? 'No winner'}</span>
            </p>
            <p className="mt-1 text-stone-500">
              Payment: <span className="font-medium text-stone-800">{auction.paymentStatus}</span>
            </p>
          </div>
        ) : auction.currentBidder ? (
          <p className="mt-4 border-t border-stone-100 pt-4 text-sm text-stone-500">
            Highest bidder: <span className="font-medium text-stone-800">{auction.currentBidder.name}</span>
          </p>
        ) : null}

        <Link
          to={`/auctions/${auction._id}`}
          className="mt-5 flex w-full justify-center rounded-sm border border-stone-300 px-4 py-2 text-sm font-medium hover:border-emerald-700 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
        >
          View auction
        </Link>
      </div>
    </article>
  )
}

export function SellerDashboardPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState({ status: '', page: 1, limit: 12 })
  const auctionsQuery = useQuery({
    queryKey: ['my-auctions', filters],
    queryFn: ({ signal }) => fetchOwnedAuctions(filters, signal),
  })
  const auctions = auctionsQuery.data?.auctions ?? []
  const summary = auctionsQuery.data?.summary ?? {
    total: 0,
    upcoming: 0,
    active: 0,
    completed: 0,
  }
  const pagination = auctionsQuery.data?.pagination

  function selectStatus(status) {
    setFilters((current) => ({ ...current, status, page: 1 }))
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <MarketplaceHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Seller dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Welcome, {user.displayName}
            </h1>
            <p className="mt-2 text-stone-600">Manage your auction listings and review their current state.</p>
          </div>
          <Link
            to="/auctions/new"
            className="inline-flex w-fit items-center gap-2 rounded-sm bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          >
            <Plus size={17} aria-hidden="true" /> Create auction
          </Link>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Total auctions', summary.total],
            ['Upcoming', summary.upcoming],
            ['Active', summary.active],
            ['Completed', summary.completed],
          ].map(([label, value]) => (
            <div key={label} className="border border-stone-200 bg-white p-4">
              <dt className="text-sm text-stone-500">{label}</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-10" aria-labelledby="my-auctions-title">
          <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="my-auctions-title" className="text-xl font-semibold">My auctions</h2>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Auction status filters">
              {FILTERS.map((filter) => (
                <button
                  key={filter.label}
                  type="button"
                  onClick={() => selectStatus(filter.value)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 ${
                    filters.status === filter.value
                      ? 'bg-emerald-800 text-white'
                      : 'bg-white text-stone-600 ring-1 ring-inset ring-stone-300'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {auctionsQuery.isPending ? <DashboardSkeleton /> : null}

          {auctionsQuery.isError ? (
            <div className="mt-6 border border-red-200 bg-red-50 p-6 text-center">
              <p className="font-semibold text-red-900">Your auctions could not be loaded.</p>
              <button
                type="button"
                onClick={() => auctionsQuery.refetch()}
                className="mt-4 rounded-sm bg-red-800 px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
              >
                Try again
              </button>
            </div>
          ) : null}

          {auctionsQuery.isSuccess && auctions.length === 0 ? (
            <div className="mt-6 border-y border-stone-200 py-12 text-center">
              <h3 className="font-semibold">No auctions in this view</h3>
              <p className="mt-2 text-sm text-stone-500">
                Create an auction or choose another status filter.
              </p>
            </div>
          ) : null}

          {auctionsQuery.isSuccess && auctions.length > 0 ? (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {auctions.map((auction) => (
                <SellerAuctionCard key={auction._id} auction={auction} />
              ))}
            </div>
          ) : null}

          {auctionsQuery.isSuccess && pagination.totalPages > 1 ? (
            <nav className="mt-8 flex items-center justify-between border-t border-stone-200 pt-5" aria-label="Seller auction pages">
              <button
                type="button"
                disabled={pagination.page <= 1 || auctionsQuery.isFetching}
                onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
                className="rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-medium disabled:text-stone-400"
              >
                Previous
              </button>
              <p className="text-sm text-stone-600">Page {pagination.page} of {pagination.totalPages}</p>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || auctionsQuery.isFetching}
                onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
                className="rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-medium disabled:text-stone-400"
              >
                Next
              </button>
            </nav>
          ) : null}
        </section>
      </main>
    </div>
  )
}
