import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Unavailable'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function DashboardSkeleton() {
  return (
    <div className="mt-6 grid animate-pulse gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading your auctions">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-96 border border-stone-200 bg-white" />
      ))}
    </div>
  )
}

function SellerAuctionCard({ auction, onDelete }) {
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const imageFailed = failedImageUrl === auction.image
  const displayedBid = auction.currentBid ?? auction.startBid
  const price = getCurrencyPresentation(displayedBid)
  const canManage = useAuctionManagementEligibility(auction)

  return (
    <article className="flex min-w-0 flex-col overflow-hidden border border-stone-200 bg-white">
      <div className="flex gap-4 border-b border-stone-100 p-4">
        <div className="aspect-[4/3] w-28 shrink-0 overflow-hidden bg-stone-100">
          {!imageFailed ? (
            <img
              src={auction.image}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setFailedImageUrl(auction.image)}
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[auction.status] ?? STATUS_STYLES.COMPLETED}`}
          >
            {STATUS_LABELS[auction.status] ?? auction.status}
          </span>
          <h2 className="mt-2 line-clamp-2 font-semibold leading-snug">{auction.title}</h2>
          {auction.category ? (
            <p className="mt-1 truncate text-xs text-stone-500">
              {auction.category}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <dl className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-stone-500">
              {auction.bidCount ? 'Current bid' : 'Starting bid'}
            </dt>
            <dd
              className="mt-1 overflow-hidden text-ellipsis text-xl font-semibold tabular-nums"
              title={price.exact}
            >
              {price.display}
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
              Winner:{' '}
              <span className="break-words font-medium text-stone-800">
                {auction.winner?.name ?? 'No winner'}
              </span>
            </p>
            {auction.winningAmount != null ? (
              <p className="mt-1 text-stone-500">
                Winning bid:{' '}
                <span className="font-medium text-stone-800">
                  {getCurrencyPresentation(auction.winningAmount).display}
                </span>
              </p>
            ) : null}
            <p className="mt-1 text-stone-500">
              Payment:{' '}
              <span className="font-medium text-stone-800">
                {auction.paymentStatus ?? 'Pending'}
              </span>
            </p>
          </div>
        ) : auction.currentBidder ? (
          <p className="mt-4 border-t border-stone-100 pt-4 text-sm text-stone-500">
            Highest bidder:{' '}
            <span className="break-words font-medium text-stone-800">
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
              className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-sm border border-stone-300 px-3 py-2 text-sm font-medium hover:border-emerald-700 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              <Eye size={15} aria-hidden="true" /> View
            </Link>
            {canManage ? (
              <>
                <Link
                  to={`/auctions/${auction._id}/edit`}
                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-sm border border-stone-300 px-3 py-2 text-sm font-medium hover:border-emerald-700 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
                >
                  <Pencil size={15} aria-hidden="true" /> Edit
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(auction)}
                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-sm border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
                >
                  <Trash2 size={15} aria-hidden="true" /> Delete
                </button>
              </>
            ) : null}
          </div>
          {!canManage ? (
            <p className="mt-3 text-xs leading-5 text-stone-500">
              Only upcoming auctions that have not started and have no bids can
              be edited or deleted.
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
    <div className="min-h-screen overflow-x-hidden bg-stone-100 text-stone-950">
      <MarketplaceHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Seller dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Welcome, {user.displayName}
            </h1>
            <p className="mt-2 text-stone-600">
              Manage upcoming listings and review live or completed auctions.
            </p>
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
            ['Live', summary.active],
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
            <h2
              ref={auctionListHeadingRef}
              id="my-auctions-title"
              tabIndex="-1"
              className="text-xl font-semibold outline-none"
            >
              My auctions
            </h2>
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
              <p className="mt-1 text-sm text-red-800">Check your connection and try again.</p>
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
                <SellerAuctionCard
                  key={auction._id}
                  auction={auction}
                  onDelete={setAuctionToDelete}
                />
              ))}
            </div>
          ) : null}

          {auctionsQuery.isSuccess && pagination?.totalPages > 1 ? (
            <nav className="mt-8 flex items-center justify-between border-t border-stone-200 pt-5" aria-label="Seller auction pages">
              <button
                type="button"
                disabled={pagination.page <= 1 || auctionsQuery.isFetching}
                onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
                className="rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
              >
                Previous
              </button>
              <p className="text-sm text-stone-600">Page {pagination.page} of {pagination.totalPages}</p>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || auctionsQuery.isFetching}
                onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
                className="rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
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
