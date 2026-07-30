import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  CheckCircle2,
  Eye,
  LayoutGrid,
  Pencil,
  Plus,
  Radio,
  Trash2,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { ConfirmDialog } from '../components/ConfirmDialog.jsx'
import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { useAuctionManagementEligibility } from '../hooks/useAuctionManagementEligibility.js'
import { useAuth } from '../hooks/useAuth.js'
import { getApiErrorMessage } from '../services/api.js'
import { deleteAuction, fetchOwnedAuctions } from '../services/auctions.js'
import { getCurrencyPresentation } from '../utils/currency.js'

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
  ACTIVE: 'Live',
  COMPLETED: 'Completed',
}

const PAYMENT_LABELS = {
  SUCCESSFUL: 'Paid',
  PENDING: 'Pending',
  FAILED: 'Failed',
}

const PAYMENT_STYLES = {
  SUCCESSFUL: 'bg-emerald-50 text-emerald-800',
  PENDING: 'bg-amber-50 text-amber-800',
  FAILED: 'bg-red-50 text-red-700',
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Unavailable'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function DashboardSkeleton() {
  return (
    <div className="mt-7" role="status" aria-label="Loading your auctions">
      <span className="sr-only">Loading your seller auctions…</span>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="surface-card h-[26rem] animate-pulse bg-white motion-reduce:animate-none"
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}

function SellerAuctionCard({ auction, onDelete }) {
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const imageFailed = failedImageUrl === auction.image
  const displayedBid = auction.currentBid ?? auction.startBid
  const price = getCurrencyPresentation(displayedBid)
  const canManage = useAuctionManagementEligibility(auction)
  const paymentStatus = auction.paymentStatus ?? 'PENDING'

  return (
    <article className="surface-card flex min-w-0 flex-col overflow-hidden">
      <div className="flex gap-4 border-b border-stone-100 p-4 sm:p-5">
        <div className="aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-stone-100 sm:w-32">
          {!imageFailed && auction.image ? (
            <img
              src={auction.image}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setFailedImageUrl(auction.image)}
            />
          ) : (
            <div className="grid h-full place-items-center px-2 text-center text-xs font-medium text-stone-500">
              Image unavailable
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={`inline-flex rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[auction.status] ?? STATUS_STYLES.COMPLETED}`}
          >
            {STATUS_LABELS[auction.status] ?? auction.status}
          </span>
          <h2 className="mt-2 line-clamp-2 text-lg font-bold leading-snug tracking-[-0.015em]">
            {auction.title}
          </h2>
          {auction.category ? (
            <p className="mt-1.5 truncate text-sm text-stone-500">
              {auction.category}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-md)] bg-stone-50 p-4">
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
              {auction.bidCount ? 'Current bid' : 'Starting bid'}
            </dt>
            <dd
              className="mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-xl font-bold tracking-[-0.02em] tabular-nums"
              title={price.exact}
            >
              {price.display}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
              Bids
            </dt>
            <dd className="mt-1.5 text-xl font-bold tabular-nums">
              {auction.bidCount}
            </dd>
          </div>
        </dl>

        <div className="mt-5 space-y-2.5 text-sm text-stone-600">
          <p className="flex items-start gap-2">
            <CalendarClock
              size={16}
              className="mt-0.5 shrink-0 text-stone-500"
              aria-hidden="true"
            />
            <span>
              Starts{' '}
              <time dateTime={auction.startAt}>{formatDate(auction.startAt)}</time>
            </span>
          </p>
          <p className="pl-6">
            Ends <time dateTime={auction.endAt}>{formatDate(auction.endAt)}</time>
          </p>
        </div>

        {auction.status === 'COMPLETED' ? (
          <div className="mt-5 rounded-[var(--radius-md)] border border-stone-200 p-3.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-stone-500">
                Winner:{' '}
                <span className="break-words font-semibold text-stone-800">
                  {auction.winner?.name ?? 'No winner'}
                </span>
              </p>
              <span
                className={`rounded-[var(--radius-sm)] px-2 py-1 text-xs font-bold ${
                  PAYMENT_STYLES[paymentStatus] ?? PAYMENT_STYLES.PENDING
                }`}
              >
                Payment {PAYMENT_LABELS[paymentStatus] ?? 'Pending'}
              </span>
            </div>
            {auction.winningAmount != null ? (
              <p className="mt-1 text-stone-500">
                Winning bid:{' '}
                <span className="font-semibold text-stone-800 tabular-nums">
                  {getCurrencyPresentation(auction.winningAmount).display}
                </span>
              </p>
            ) : null}
          </div>
        ) : auction.currentBidder ? (
          <p className="mt-5 text-sm text-stone-500">
            Highest bidder:{' '}
            <span className="break-words font-semibold text-stone-800">
              {auction.currentBidder.name}
            </span>
          </p>
        ) : null}

        <div className="mt-auto pt-5">
          <div
            className={`grid gap-2 ${
              canManage ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'
            }`}
          >
            <Link
              to={`/auctions/${auction._id}`}
              className="btn-secondary min-w-0 px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
            >
              <Eye size={15} aria-hidden="true" /> View
            </Link>
            {canManage ? (
              <>
                <Link
                  to={`/auctions/${auction._id}/edit`}
                  className="btn-secondary min-w-0 px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
                >
                  <Pencil size={15} aria-hidden="true" /> Edit
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(auction)}
                  className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-red-200 px-3 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
                >
                  <Trash2 size={15} aria-hidden="true" /> Delete
                </button>
              </>
            ) : null}
          </div>
          {!canManage ? (
            <p className="mt-2 text-xs leading-5 text-stone-500">
              Edit and delete are available only before the auction starts and
              before any bids are placed.
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function SellerDashboardPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const auctionListHeadingRef = useRef(null)
  const [filters, setFilters] = useState({ status: '', page: 1, limit: 12 })
  const [auctionToDelete, setAuctionToDelete] = useState(null)
  const selectedAuctionCanBeManaged =
    useAuctionManagementEligibility(auctionToDelete)
  const auctionsQuery = useQuery({
    queryKey: ['my-auctions', user.id ?? user._id, filters],
    queryFn: ({ signal }) => fetchOwnedAuctions(filters, signal),
  })
  const deleteMutation = useMutation({ mutationFn: deleteAuction })
  const auctions = auctionsQuery.data?.auctions ?? []
  const summary = auctionsQuery.data?.summary ?? {
    total: 0,
    upcoming: 0,
    active: 0,
    completed: 0,
  }
  const pagination = auctionsQuery.data?.pagination
  const activeFilter =
    FILTERS.find((filter) => filter.value === filters.status) ?? FILTERS[0]

  useEffect(() => {
    if (
      auctionToDelete &&
      !selectedAuctionCanBeManaged &&
      !deleteMutation.isPending
    ) {
      setAuctionToDelete(null)
    }
  }, [
    auctionToDelete,
    deleteMutation.isPending,
    selectedAuctionCanBeManaged,
  ])

  function selectStatus(status) {
    setFilters((current) => ({ ...current, status, page: 1 }))
  }

  const closeDeleteDialog = useCallback(() => {
    if (!deleteMutation.isPending) {
      setAuctionToDelete(null)
    }
  }, [deleteMutation.isPending])

  async function confirmDelete() {
    if (!auctionToDelete || deleteMutation.isPending) {
      return
    }

    if (!selectedAuctionCanBeManaged) {
      setAuctionToDelete(null)
      toast.error('This auction can no longer be deleted.')
      void queryClient.invalidateQueries({ queryKey: ['my-auctions'] })
      return
    }

    const deletedAuction = auctionToDelete

    try {
      await deleteMutation.mutateAsync(deletedAuction._id)
      setAuctionToDelete(null)
      queryClient.removeQueries({ queryKey: ['auction', deletedAuction._id] })
      queryClient.setQueriesData(
        { queryKey: ['my-auctions'] },
        (cachedData) => {
          if (
            !cachedData?.auctions?.some(
              (auction) => auction._id === deletedAuction._id,
            )
          ) {
            return cachedData
          }

          const totalItems = Math.max(
            0,
            (cachedData.pagination?.totalItems ?? 1) - 1,
          )
          const limit = cachedData.pagination?.limit ?? filters.limit

          return {
            ...cachedData,
            auctions: cachedData.auctions.filter(
              (auction) => auction._id !== deletedAuction._id,
            ),
            summary: cachedData.summary
              ? {
                  ...cachedData.summary,
                  total: Math.max(0, cachedData.summary.total - 1),
                  upcoming: Math.max(0, cachedData.summary.upcoming - 1),
                }
              : cachedData.summary,
            pagination: cachedData.pagination
              ? {
                  ...cachedData.pagination,
                  totalItems,
                  totalPages: Math.ceil(totalItems / limit),
                }
              : cachedData.pagination,
          }
        },
      )

      if (auctions.length === 1 && filters.page > 1) {
        setFilters((current) => ({ ...current, page: current.page - 1 }))
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-auctions'] }),
        queryClient.invalidateQueries({ queryKey: ['auctions'] }),
      ])
      toast.success('Auction deleted successfully')
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          'The auction could not be deleted. Refresh and try again.',
        ),
      )
    }
  }

  return (
    <div className="app-shell">
      <MarketplaceHeader />
      <main className="app-container py-9 sm:py-12 lg:py-14">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-kicker">Seller dashboard</p>
            <h1 className="page-title mt-2 break-words">
              Welcome, {user.displayName}
            </h1>
            <p className="page-description mt-3">
              Manage upcoming listings and review live or completed auctions.
            </p>
          </div>
          <Link
            to="/auctions/new"
            className="btn-primary w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 sm:w-auto"
          >
            <Plus size={17} aria-hidden="true" /> Create auction
          </Link>
        </div>

        <dl className="mt-9 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {[
            {
              label: 'Total auctions',
              value: summary.total,
              icon: LayoutGrid,
              iconStyle:
                'bg-[var(--color-green-soft)] text-[var(--color-green-primary)]',
            },
            {
              label: 'Upcoming',
              value: summary.upcoming,
              icon: CalendarClock,
              iconStyle: 'bg-amber-50 text-amber-700',
            },
            {
              label: 'Live',
              value: summary.active,
              icon: Radio,
              iconStyle: 'bg-sky-50 text-sky-700',
            },
            {
              label: 'Completed',
              value: summary.completed,
              icon: CheckCircle2,
              iconStyle: 'bg-stone-100 text-stone-700',
            },
          ].map(({ label, value, icon: Icon, iconStyle }) => (
            <div key={label} className="surface-card p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-sm font-semibold text-stone-600">{label}</dt>
                <span
                  className={`hidden h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] sm:grid ${iconStyle}`}
                >
                  {createElement(Icon, { size: 17, 'aria-hidden': true })}
                </span>
              </div>
              <dd className="mt-3 text-3xl font-bold tracking-[-0.03em] tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <section className="mt-12" aria-labelledby="my-auctions-title">
          <div className="flex flex-col gap-5 border-b border-[var(--color-border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                ref={auctionListHeadingRef}
                id="my-auctions-title"
                tabIndex="-1"
                className="text-2xl font-bold tracking-[-0.025em] outline-none"
              >
                My auctions
              </h2>
              <p className="mt-1.5 text-sm text-stone-500">
                Showing {activeFilter.label.toLowerCase()} listings
              </p>
            </div>
            <div
              className="soft-scrollbar flex gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label="Auction status filters"
            >
              {FILTERS.map((filter) => (
                <button
                  key={filter.label}
                  type="button"
                  aria-pressed={filters.status === filter.value}
                  onClick={() => selectStatus(filter.value)}
                  className={`min-h-10 shrink-0 whitespace-nowrap rounded-[var(--radius-sm)] border px-3.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 ${
                    filters.status === filter.value
                      ? 'border-[var(--color-green-primary)] bg-[var(--color-green-soft)] text-[var(--color-green-hover)]'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-950'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {auctionsQuery.isPending ? <DashboardSkeleton /> : null}

          {auctionsQuery.isError ? (
            <div
              className="surface-card mt-7 px-5 py-10 text-center"
              role="alert"
            >
              <p className="text-lg font-bold text-stone-950">
                Your auctions could not be loaded
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Check your connection and try again.
              </p>
              <button
                type="button"
                onClick={() => auctionsQuery.refetch()}
                className="btn-primary mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
              >
                Try again
              </button>
            </div>
          ) : null}

          {auctionsQuery.isSuccess && auctions.length === 0 ? (
            <div className="surface-card mt-7 px-5 py-12 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-stone-100 text-stone-500">
                <LayoutGrid size={21} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold">
                {filters.status
                  ? `No ${activeFilter.label.toLowerCase()} auctions`
                  : 'No auctions yet'}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">
                {filters.status
                  ? 'Choose another status to review the rest of your listings.'
                  : 'Create your first listing and manage it here from scheduling through completion.'}
              </p>
              {filters.status ? (
                <button
                  type="button"
                  onClick={() => selectStatus('')}
                  className="btn-secondary mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
                >
                  View all auctions
                </button>
              ) : (
                <Link
                  to="/auctions/new"
                  className="btn-primary mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
                >
                  <Plus size={16} aria-hidden="true" /> Create auction
                </Link>
              )}
            </div>
          ) : null}

          {auctionsQuery.isSuccess && auctions.length > 0 ? (
            <div
              className="mt-7 grid gap-6 transition-opacity md:grid-cols-2 xl:grid-cols-3"
              aria-busy={auctionsQuery.isFetching}
            >
              {auctions.map((auction) => (
                <SellerAuctionCard
                  key={auction._id}
                  auction={auction}
                  onDelete={setAuctionToDelete}
                />
              ))}
            </div>
          ) : null}

          {auctionsQuery.isSuccess && pagination?.totalPages > 1 ? (
            <nav
              className="surface-card mt-9 flex items-center justify-between gap-3 p-3 sm:p-4"
              aria-label="Seller auction pages"
            >
              <button
                type="button"
                disabled={pagination.page <= 1 || auctionsQuery.isFetching}
                onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
                className="btn-secondary min-w-0 px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 sm:px-4"
              >
                Previous
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
                disabled={pagination.page >= pagination.totalPages || auctionsQuery.isFetching}
                onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
                className="btn-secondary min-w-0 px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2 sm:px-4"
              >
                Next
              </button>
            </nav>
          ) : null}
        </section>
      </main>

      <ConfirmDialog
        open={Boolean(auctionToDelete && selectedAuctionCanBeManaged)}
        title="Delete this auction?"
        description={
          auctionToDelete
            ? `“${auctionToDelete.title}” will be permanently removed. This action cannot be undone.`
            : ''
        }
        isConfirming={deleteMutation.isPending}
        onCancel={closeDeleteDialog}
        onConfirm={confirmDelete}
        fallbackFocusRef={auctionListHeadingRef}
      />
    </div>
  )
}
