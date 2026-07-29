import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  CircleDot,
  Gavel,
  Radio,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { useAuctionRoom } from '../hooks/useAuctionRoom.js'
import { useAuth } from '../hooks/useAuth.js'
import { fetchAuction } from '../services/auctions.js'

const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
})

const STATUS_LABELS = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Live',
  COMPLETED: 'Completed',
}

const STATUS_STYLES = {
  UPCOMING: 'bg-amber-50 text-amber-800 ring-amber-200',
  ACTIVE: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  COMPLETED: 'bg-stone-100 text-stone-700 ring-stone-200',
}

function formatDate(value) {
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? 'Unavailable'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const clock = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')

  return days > 0 ? `${days}d ${clock}` : clock
}

function useServerCountdown(endAt, serverTime) {
  const [estimatedServerTime, setEstimatedServerTime] = useState(serverTime)

  useEffect(() => {
    if (!Number.isFinite(serverTime)) {
      setEstimatedServerTime(null)
      return undefined
    }

    const receivedAt = Date.now()
    const update = () => {
      setEstimatedServerTime(serverTime + (Date.now() - receivedAt))
    }

    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [serverTime])

  if (!Number.isFinite(estimatedServerTime)) {
    return null
  }

  const endTime = new Date(endAt).getTime()
  return Number.isFinite(endTime)
    ? Math.max(0, endTime - estimatedServerTime)
    : 0
}

function DetailsSkeleton() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-5 w-36 bg-stone-200" />
      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <div className="aspect-[4/3] bg-stone-200" />
          <div className="h-8 w-3/4 bg-stone-200" />
          <div className="h-20 bg-stone-200" />
        </div>
        <div className="h-[30rem] bg-white ring-1 ring-stone-200 lg:col-span-5" />
        <div className="h-72 bg-white ring-1 ring-stone-200 lg:col-span-3" />
      </div>
    </main>
  )
}

function EmptyState({ children }) {
  return <p className="py-8 text-center text-sm text-stone-500">{children}</p>
}

function BidList({ bids }) {
  if (!bids?.length) {
    return <EmptyState>No bids have been recorded yet.</EmptyState>
  }

  return (
    <ol className="divide-y divide-stone-100">
      {[...bids].reverse().map((bid) => (
        <li key={bid.id} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800">
              Bidder {bid.bidder ? `…${bid.bidder.slice(-6)}` : 'participant'}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              {formatDate(bid.timestamp)}
            </p>
          </div>
          <p className="font-semibold tabular-nums">
            {numberFormatter.format(bid.amount)}
          </p>
        </li>
      ))}
    </ol>
  )
}

function TimelineList({ timeline }) {
  if (!timeline?.length) {
    return <EmptyState>No timeline activity is available yet.</EmptyState>
  }

  return (
    <ol className="space-y-4 py-2">
      {[...timeline].reverse().map((event) => (
        <li key={event.id} className="flex gap-3">
          <CircleDot
            size={16}
            className="mt-0.5 shrink-0 text-emerald-700"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-stone-800">
              {event.eventType.replaceAll('_', ' ').toLowerCase()}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              {formatDate(event.timestamp)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ParticipantPanel({ role, activeBidderCount, spectatorCount }) {
  const roleText = {
    SELLER: 'You are the seller. Bidding is disabled.',
    BIDDER: 'You can submit bids while this auction is active.',
    SPECTATOR: 'You are viewing this auction in read-only mode.',
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Your role
        </p>
        <p className="mt-2 text-lg font-semibold text-stone-950">
          {role ?? 'Synchronising'}
        </p>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          {roleText[role] ?? 'Waiting for the server-provided room role.'}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div className="border border-stone-200 bg-stone-50 p-3">
          <dt className="flex items-center gap-2 text-xs text-stone-500">
            <Gavel size={14} aria-hidden="true" /> Bidders
          </dt>
          <dd className="mt-2 text-2xl font-semibold tabular-nums">
            {activeBidderCount}
          </dd>
        </div>
        <div className="border border-stone-200 bg-stone-50 p-3">
          <dt className="flex items-center gap-2 text-xs text-stone-500">
            <Users size={14} aria-hidden="true" /> Spectators
          </dt>
          <dd className="mt-2 text-2xl font-semibold tabular-nums">
            {spectatorCount}
          </dd>
        </div>
      </dl>

      <p className="text-sm leading-6 text-stone-500">
        Participant identities are not exposed by the current room contract.
      </p>

      <div className="border-t border-stone-200 pt-5">
        <p className="font-medium text-stone-800">Chat</p>
        <p className="mt-2 text-sm text-stone-500">
          Room chat is not available in this release.
        </p>
      </div>
    </div>
  )
}

export function AuctionDetailsPage() {
  const { auctionId } = useParams()
  const { user, isRestoringSession } = useAuth()
  const [imageFailed, setImageFailed] = useState(false)
  const [bidAmount, setBidAmount] = useState('')
  const [inputError, setInputError] = useState('')
  const [mobileTab, setMobileTab] = useState('bids')
  const auctionQuery = useQuery({
    queryKey: ['auction', auctionId],
    queryFn: ({ signal }) => fetchAuction(auctionId, signal),
  })
  const room = useAuctionRoom({
    auctionId,
    user,
    isRestoringSession,
    enabled: auctionQuery.isSuccess,
  })

  const restAuction = auctionQuery.data
  const liveAuction = room.snapshot?.auction
  const auction = restAuction
    ? {
        ...restAuction,
        ...liveAuction,
        _id: liveAuction?.id ?? liveAuction?._id ?? restAuction._id,
        seller: restAuction.seller,
      }
    : null
  const remainingTime = useServerCountdown(
    auction?.endAt,
    room.snapshot?.serverTime,
  )
  const currentBid = auction?.currentBid ?? auction?.startBid ?? 0
  const minimumNextBid = currentBid + (auction?.minimumIncrement ?? 0)
  const role = room.snapshot?.currentUserRole
  const canBid =
    role === 'BIDDER' &&
    auction?.status === 'ACTIVE' &&
    room.connectionState === 'connected' &&
    room.isSynced

  function handleBidSubmit(event) {
    event.preventDefault()
    const amount = Number(bidAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setInputError('Enter a valid positive bid amount')
      return
    }

    setInputError('')
    room.clearBidError()
    room.submitBid(amount)
  }

  if (auctionQuery.isPending) {
    return (
      <div className="min-h-screen bg-stone-100 text-stone-950">
        <MarketplaceHeader />
        <DetailsSkeleton />
      </div>
    )
  }

  if (auctionQuery.isError) {
    const status = auctionQuery.error.response?.status
    const invalidId = status === 400
    const notFound = status === 404

    return (
      <div className="min-h-screen bg-stone-100 text-stone-950">
        <MarketplaceHeader />
        <main className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <p className="text-sm font-semibold text-emerald-800">
            {invalidId ? 'Invalid auction link' : notFound ? 'Not found' : 'Error'}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {invalidId || notFound
              ? 'This auction is unavailable'
              : 'Auction details could not be loaded'}
          </h1>
          <p className="mt-3 text-stone-600">
            {invalidId || notFound
              ? 'The auction may have been removed or the link is incorrect.'
              : 'Check your connection and try again.'}
          </p>
          <Link
            to="/auctions"
            className="mt-7 inline-flex rounded-sm bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          >
            Return to auctions
          </Link>
        </main>
      </div>
    )
  }

  const connectionLabel = {
    connecting: 'Connecting',
    connected: room.isSynced ? 'Live connection' : 'Synchronising',
    reconnecting: 'Reconnecting',
    disconnected: 'Disconnected',
  }[room.connectionState]
  const statusLabel = STATUS_LABELS[auction.status] ?? auction.status
  const readOnlyReason =
    role === 'SELLER'
      ? 'Sellers cannot bid on their own auctions.'
      : role === 'SPECTATOR'
        ? user
          ? 'This room is read-only for your current connection.'
          : 'Sign in to join as a bidder.'
        : auction.status === 'UPCOMING'
          ? 'Bidding opens when the server starts the auction.'
          : auction.status === 'COMPLETED'
            ? 'This auction is complete.'
            : !room.isSynced
              ? 'Waiting for authoritative room state.'
              : ''

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <MarketplaceHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/auctions"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-950"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to auctions
        </Link>

        {room.roomError ? (
          <div className="mt-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {room.roomError}
          </div>
        ) : null}

        <div className="mt-7 grid gap-6 lg:grid-cols-12 lg:items-start">
          <section className="lg:col-span-4" aria-labelledby="auction-title">
            <div className="aspect-[4/3] overflow-hidden border border-stone-200 bg-stone-200">
              {!imageFailed ? (
                <img
                  src={auction.image}
                  alt={auction.title}
                  className="h-full w-full object-cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm text-stone-500">
                  Image unavailable
                </div>
              )}
            </div>

            <h1
              id="auction-title"
              className="mt-6 text-3xl font-semibold tracking-tight"
            >
              {auction.title}
            </h1>
            <p className="mt-3 whitespace-pre-wrap leading-7 text-stone-600">
              {auction.description}
            </p>

            <div className="mt-6 border-y border-stone-200 py-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Seller
              </p>
              <p className="mt-2 font-semibold">
                {auction.seller?.name ?? 'BidArena seller'}
              </p>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="flex items-center gap-2 text-stone-500">
                  <CalendarDays size={16} aria-hidden="true" /> Starts
                </dt>
                <dd className="text-right font-medium">{formatDate(auction.startAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="flex items-center gap-2 text-stone-500">
                  <CalendarDays size={16} aria-hidden="true" /> Ends
                </dt>
                <dd className="text-right font-medium">{formatDate(auction.endAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="space-y-6 lg:col-span-5" aria-label="Live auction">
            <div className="border border-stone-200 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[auction.status] ?? STATUS_STYLES.COMPLETED}`}
                >
                  {statusLabel}
                </span>
                <span className="flex items-center gap-2 text-xs font-medium text-stone-500">
                  <Radio
                    size={14}
                    className={
                      room.connectionState === 'connected'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }
                    aria-hidden="true"
                  />
                  {connectionLabel}
                </span>
              </div>

              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Current highest bid
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
                    {numberFormatter.format(currentBid)}
                  </p>
                  <p className="mt-2 text-sm text-stone-500">
                    Minimum next bid: {numberFormatter.format(minimumNextBid)}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Remaining time
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
                    {remainingTime === null
                      ? '--:--:--'
                      : formatDuration(remainingTime)}
                  </p>
                  <p className="mt-2 text-sm text-stone-500">
                    Synced to server time
                  </p>
                </div>
              </div>

              <form onSubmit={handleBidSubmit} className="mt-8 border-t border-stone-200 pt-6">
                <label className="block text-sm font-medium" htmlFor="bid-amount">
                  Your bid
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="bid-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={bidAmount}
                    disabled={!canBid || room.isSubmittingBid}
                    placeholder={String(minimumNextBid)}
                    onChange={(event) => {
                      setBidAmount(event.target.value)
                      setInputError('')
                      room.clearBidError()
                    }}
                    className="min-w-0 flex-1 rounded-sm border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 disabled:bg-stone-100"
                  />
                  <button
                    type="submit"
                    disabled={!canBid || room.isSubmittingBid}
                    className="rounded-sm bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
                  >
                    {room.isSubmittingBid ? 'Awaiting confirmation…' : 'Place bid'}
                  </button>
                </div>
                {inputError || room.bidError ? (
                  <p className="mt-3 text-sm text-red-700" role="alert">
                    {inputError || room.bidError}
                  </p>
                ) : readOnlyReason ? (
                  <p className="mt-3 text-sm text-stone-500">{readOnlyReason}</p>
                ) : null}
              </form>
            </div>

            <div className="hidden space-y-6 lg:block">
              <section className="border border-stone-200 bg-white p-5">
                <h2 className="font-semibold">Recent bids</h2>
                <BidList bids={room.snapshot?.latestBids} />
              </section>
              <section className="border border-stone-200 bg-white p-5">
                <h2 className="font-semibold">Timeline</h2>
                <TimelineList timeline={room.snapshot?.timeline} />
              </section>
            </div>
          </section>

          <aside className="hidden border border-stone-200 bg-white p-5 lg:col-span-3 lg:block">
            <h2 className="font-semibold">Room information</h2>
            <div className="mt-5">
              <ParticipantPanel
                role={role}
                activeBidderCount={room.snapshot?.activeBidderCount ?? 0}
                spectatorCount={room.snapshot?.spectatorCount ?? 0}
              />
            </div>
          </aside>

          <section className="lg:hidden lg:col-span-12" aria-label="Auction activity">
            <div className="flex border-b border-stone-300" role="tablist">
              {['bids', 'timeline', 'participants'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 border-b-2 px-2 py-3 text-sm font-medium capitalize focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-700 ${
                    mobileTab === tab
                      ? 'border-emerald-700 text-emerald-800'
                      : 'border-transparent text-stone-500'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="border border-t-0 border-stone-200 bg-white p-5">
              {mobileTab === 'bids' ? (
                <BidList bids={room.snapshot?.latestBids} />
              ) : null}
              {mobileTab === 'timeline' ? (
                <TimelineList timeline={room.snapshot?.timeline} />
              ) : null}
              {mobileTab === 'participants' ? (
                <ParticipantPanel
                  role={role}
                  activeBidderCount={room.snapshot?.activeBidderCount ?? 0}
                  spectatorCount={room.snapshot?.spectatorCount ?? 0}
                />
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
