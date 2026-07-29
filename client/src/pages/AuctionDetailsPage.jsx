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

function identityId(value) {
  if (typeof value === 'string') {
    return value
  }

  return value?.id ?? value?._id ?? null
}

function embeddedIdentity(value) {
  if (!value || typeof value === 'string') {
    return null
  }

  return {
    id: identityId(value),
    name: value.name ?? value.displayName,
    avatar: value.avatar,
  }
}

function createIdentityMap({ user, seller, auction, bids, timeline }) {
  const identities = new Map()
  const candidates = [
    user
      ? { id: user.id, name: user.displayName, avatar: user.avatar }
      : null,
    seller,
    embeddedIdentity(auction?.currentBidder),
    embeddedIdentity(auction?.winner),
    ...(bids ?? []).map((bid) => embeddedIdentity(bid.bidder)),
    ...(timeline ?? []).map((event) => embeddedIdentity(event.actor)),
  ]

  for (const candidate of candidates) {
    const id = identityId(candidate)

    if (id) {
      const known = identities.get(id)
      identities.set(id, {
        id,
        name: candidate.name ?? candidate.displayName ?? known?.name,
        avatar: candidate.avatar ?? known?.avatar,
      })
    }
  }

  return identities
}

function resolveIdentity(value, identities) {
  const id = identityId(value)
  const embedded = embeddedIdentity(value)
  const known = id ? identities.get(id) : null

  return {
    id,
    name: embedded?.name ?? known?.name ?? 'Participant',
    avatar: embedded?.avatar ?? known?.avatar ?? '',
  }
}

function shortId(id) {
  return id ? `…${id.slice(-6)}` : 'Unavailable'
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function UserAvatar({ identity, className = 'h-9 w-9 text-xs' }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-200 ${className}`}
      aria-hidden="true"
    >
      {initials(identity.name)}
      {identity.avatar ? (
        <img
          src={identity.avatar}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => event.currentTarget.remove()}
        />
      ) : null}
    </span>
  )
}

function BidList({ bids, identities }) {
  if (!bids?.length) {
    return <EmptyState>No bids have been recorded yet.</EmptyState>
  }

  return (
    <ol className="divide-y divide-stone-100">
      {bids.map((bid, index) => {
        const bidder = resolveIdentity(bid.bidder, identities)
        const sequence = bid.serverSequence ?? bid.sequence

        return (
          <li
            key={bid.id ?? sequence}
            className={`flex items-center justify-between gap-3 py-3 ${
              index === 0 ? 'bg-emerald-50/60' : ''
            }`}
          >
            <div className="flex min-w-0 items-center gap-3 px-2">
              <UserAvatar identity={bidder} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {bidder.name}
                  </p>
                  {index === 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-800">
                      Latest
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-stone-500">
                  ID: {shortId(bidder.id)} · {formatDate(bid.timestamp)}
                  {sequence ? ` · #${sequence}` : ''}
                </p>
              </div>
            </div>
            <p className="shrink-0 pr-2 font-semibold tabular-nums">
              {numberFormatter.format(bid.amount)}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

function timelineMessage(event, identities, auction) {
  const eventType = event.eventType ?? event.type
  const actor = resolveIdentity(event.actor, identities)
  const amount =
    event.metadata?.winningBid ??
    event.metadata?.amount ??
    event.metadata?.finalBid

  if (eventType === 'BID_ACCEPTED') {
    return `${actor.name} placed a bid${
      amount !== undefined ? ` of ${numberFormatter.format(amount)}` : ''
    }`
  }

  if (eventType === 'WINNER_DECLARED') {
    return `${actor.name} won the auction${
      amount !== undefined
        ? ` with a bid of ${numberFormatter.format(amount)}`
        : ''
    }`
  }

  if (eventType === 'AUCTION_STARTED') {
    return 'The auction is now live'
  }

  if (eventType === 'AUCTION_COMPLETED') {
    if (auction?.winner === null) {
      return 'The auction ended with no bids'
    }

    return amount !== null && amount !== undefined
      ? `The auction completed at ${numberFormatter.format(amount)}`
      : 'The auction ended with no bids'
  }

  return (eventType ?? 'Auction updated')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase())
}

function TimelineList({ timeline, identities, auction }) {
  if (!timeline?.length) {
    return <EmptyState>No timeline activity is available yet.</EmptyState>
  }

  return (
    <ol className="divide-y divide-stone-100">
      {timeline.map((event) => (
        <li key={event.id ?? event.sequence} className="flex gap-3 py-3">
          <CircleDot
            size={16}
            className="mt-0.5 shrink-0 text-emerald-700"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium leading-5 text-stone-800">
              {timelineMessage(event, identities, auction)}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {formatDate(event.timestamp ?? event.occurredAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ParticipantPanel({
  role,
  activeBidderCount,
  spectatorCount,
  connectionLabel,
  connectionState,
  auctionStatus,
}) {
  const roleText = {
    SELLER: 'You are the seller. Bidding is disabled.',
    BIDDER:
      auctionStatus === 'COMPLETED'
        ? 'You joined as a bidder. This auction is complete.'
        : 'You can submit bids while this auction is active.',
    SPECTATOR: 'You are viewing this auction in read-only mode.',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex items-center gap-2 text-sm font-medium ${
            connectionState === 'connected'
              ? 'text-emerald-800'
              : 'text-amber-800'
          }`}
        >
          <Radio size={14} aria-hidden="true" /> {connectionLabel}
        </span>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 ring-1 ring-inset ring-stone-200">
          {role ?? 'Synchronising'}
        </span>
      </div>
      <div>
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
        Counts reflect the participants currently connected to this room.
      </p>
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
  const identities = createIdentityMap({
    user,
    seller: auction?.seller,
    auction,
    bids: room.snapshot?.latestBids,
    timeline: room.snapshot?.timeline,
  })
  const currentBidder = resolveIdentity(auction?.currentBidder, identities)
  const winner = resolveIdentity(auction?.winner, identities)
  const hasAuthoritativeWinner =
    room.isSynced &&
    Object.hasOwn(room.snapshot?.auction ?? {}, 'winner')
  const role = room.snapshot?.currentUserRole
  const canBid =
    role === 'BIDDER' &&
    auction?.status === 'ACTIVE' &&
    room.connectionState === 'connected' &&
    room.isSynced

  useEffect(() => {
    if (auction?.status === 'COMPLETED') {
      setBidAmount('')
      setInputError('')
    }
  }, [auction?.status])

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
    auction.status === 'COMPLETED'
      ? 'This auction is complete.'
      : room.connectionState !== 'connected'
        ? 'Bidding is paused while the live connection reconnects.'
        : role === 'SELLER'
          ? 'Sellers cannot bid on their own auctions.'
          : role === 'SPECTATOR'
            ? user
              ? 'This room is read-only for your current connection.'
              : 'Sign in to join as a bidder.'
            : auction.status === 'UPCOMING'
              ? 'Bidding opens when the server starts the auction.'
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
                  {auction.status !== 'COMPLETED' ? (
                    <p className="mt-2 text-sm text-stone-500">
                      Minimum next bid: {numberFormatter.format(minimumNextBid)}
                    </p>
                  ) : null}
                  {auction.currentBidder ? (
                    <div className="mt-3 flex items-center gap-2">
                      <UserAvatar
                        identity={currentBidder}
                        className="h-7 w-7 text-[0.6rem]"
                      />
                      <p className="min-w-0 text-sm text-stone-600">
                        <span className="font-medium text-stone-900">
                          {currentBidder.name}
                        </span>{' '}
                        · ID: {shortId(currentBidder.id)}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {auction.status === 'COMPLETED'
                      ? 'Auction ended'
                      : 'Remaining time'}
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
                    {auction.status === 'COMPLETED'
                      ? formatDuration(0)
                      : remainingTime === null
                      ? '--:--:--'
                      : formatDuration(remainingTime)}
                  </p>
                  <p className="mt-2 text-sm text-stone-500">
                    Synced to server time
                  </p>
                </div>
              </div>

              {auction.status === 'COMPLETED' ? (
                <section className="mt-7 border border-emerald-200 bg-emerald-50 p-4">
                  {winner.id ? (
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        identity={winner}
                        className="h-12 w-12 text-sm"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                          Winner
                        </p>
                        <p className="mt-1 truncate font-semibold text-stone-950">
                          {winner.name}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-600">
                          ID: {shortId(winner.id)}
                        </p>
                        <p className="mt-1 text-sm font-medium text-stone-800">
                          Winning bid:{' '}
                          {auction.winningAmount !== null &&
                          auction.winningAmount !== undefined
                            ? numberFormatter.format(auction.winningAmount)
                            : 'Unavailable'}
                        </p>
                      </div>
                    </div>
                  ) : hasAuthoritativeWinner && auction.winner === null ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                        Auction complete
                      </p>
                      <p className="mt-1 font-semibold text-stone-900">
                        Auction ended with no bids
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                        Final result
                      </p>
                      <p className="mt-1 font-semibold text-stone-900">
                        Synchronising winner information…
                      </p>
                    </div>
                  )}
                </section>
              ) : null}

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
                <BidList
                  bids={room.snapshot?.latestBids}
                  identities={identities}
                />
              </section>
              <section className="border border-stone-200 bg-white p-5">
                <h2 className="font-semibold">Timeline</h2>
                <TimelineList
                  timeline={room.snapshot?.timeline}
                  identities={identities}
                  auction={auction}
                />
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
                connectionLabel={connectionLabel}
                connectionState={room.connectionState}
                auctionStatus={auction.status}
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
                <BidList
                  bids={room.snapshot?.latestBids}
                  identities={identities}
                />
              ) : null}
              {mobileTab === 'timeline' ? (
                <TimelineList
                  timeline={room.snapshot?.timeline}
                  identities={identities}
                  auction={auction}
                />
              ) : null}
              {mobileTab === 'participants' ? (
                <ParticipantPanel
                  role={role}
                  activeBidderCount={room.snapshot?.activeBidderCount ?? 0}
                  spectatorCount={room.snapshot?.spectatorCount ?? 0}
                  connectionLabel={connectionLabel}
                  connectionState={room.connectionState}
                  auctionStatus={auction.status}
                />
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
