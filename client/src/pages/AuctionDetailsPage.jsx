import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  CircleDot,
  Radio,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  AuctionChatPanel,
  AuctionHeatBadge,
  AuctionInsightsPanel,
} from '../components/AuctionRoomPanels.jsx'
import { AuctionPaymentCard } from '../components/AuctionPaymentCard.jsx'
import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { useAuctionRoom } from '../hooks/useAuctionRoom.js'
import { useAuth } from '../hooks/useAuth.js'
import { fetchAuction } from '../services/auctions.js'
import {
  formatCurrency,
  getCurrencyPresentation,
} from '../utils/currency.js'

const STATUS_LABELS = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Live',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const STATUS_STYLES = {
  UPCOMING: 'bg-amber-50 text-amber-800 ring-amber-200',
  ACTIVE: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  COMPLETED: 'bg-stone-100 text-stone-700 ring-stone-200',
  CANCELLED: 'bg-red-50 text-red-800 ring-red-200',
}

const PARTIAL_CURRENCY_PATTERN = /^\d*(?:\.\d{0,2})?$/
const COMPLETE_CURRENCY_PATTERN = /^\d+(?:\.\d{1,2})?$/
const BLOCKED_BID_KEYS = new Set(['e', 'E', '+', '-', ' '])
const MOBILE_ACTIVITY_TABS = ['activity', 'chat', 'insights']
const MAX_SAFE_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER)

function parseSafeBidAmount(value) {
  if (value.length > 19 || !COMPLETE_CURRENCY_PATTERN.test(value)) {
    return null
  }

  const [wholePart, fractionPart = ''] = value.split('.')
  const wholeAmount = BigInt(wholePart)

  if (!fractionPart || /^0+$/.test(fractionPart)) {
    if (wholeAmount === 0n || wholeAmount > MAX_SAFE_AMOUNT) {
      return null
    }

    return Number(wholeAmount)
  }

  const minorUnits =
    wholeAmount * 100n + BigInt(fractionPart.padEnd(2, '0'))

  if (minorUnits === 0n || minorUnits > MAX_SAFE_AMOUNT) {
    return null
  }

  const amount = Number(value)
  const recoveredMinorUnits = Math.round(amount * 100)

  if (
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(recoveredMinorUnits) ||
    BigInt(recoveredMinorUnits) !== minorUnits
  ) {
    return null
  }

  return amount
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

function useCompactRoomTabs() {
  const [isCompact, setIsCompact] = useState(() =>
    typeof window === 'undefined' || !window.matchMedia
      ? true
      : window.matchMedia('(max-width: 1023px)').matches,
  )

  useEffect(() => {
    if (!window.matchMedia) {
      return undefined
    }

    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    const handleChange = () => setIsCompact(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return isCompact
}

function DetailsSkeleton() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-5 w-36 bg-stone-200" />
      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5 xl:col-span-3">
          <div className="aspect-[4/3] bg-stone-200" />
          <div className="h-8 w-3/4 bg-stone-200" />
          <div className="h-20 bg-stone-200" />
        </div>
        <div className="h-[30rem] bg-white ring-1 ring-stone-200 lg:col-span-7 xl:col-span-5" />
        <div className="h-72 bg-white ring-1 ring-stone-200 lg:col-span-12 xl:col-span-4" />
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
    avatar: value.avatar ?? value.avatarUrl,
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
        const bidPresentation = getCurrencyPresentation(bid.amount)

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
            <p
              className="max-w-[45%] shrink-0 break-words pr-2 text-right font-semibold tabular-nums"
              title={bidPresentation.exact}
            >
              {bidPresentation.display}
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
      amount !== undefined ? ` of ${formatCurrency(amount)}` : ''
    }`
  }

  if (eventType === 'WINNER_DECLARED') {
    return `${actor.name} won the auction${
      amount !== undefined
        ? ` with a bid of ${formatCurrency(amount)}`
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
      ? `The auction completed at ${formatCurrency(amount)}`
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

export function AuctionDetailsPage() {
  const { auctionId } = useParams()
  const { user, isRestoringSession } = useAuth()
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const [bidAmount, setBidAmount] = useState('')
  const [inputError, setInputError] = useState('')
  const [mobileTab, setMobileTab] = useState('activity')
  const usesCompactRoomTabs = useCompactRoomTabs()
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
  const imageFailed = failedImageUrl === auction?.image
  const remainingTime = useServerCountdown(
    auction?.endAt,
    room.snapshot?.serverTime,
  )
  const currentBid = auction?.currentBid ?? auction?.startBid ?? 0
  const minimumNextBid = currentBid + (auction?.minimumIncrement ?? 0)
  const currentBidPresentation = getCurrencyPresentation(currentBid)
  const winningBidPresentation = getCurrencyPresentation(
    auction?.winningAmount,
  )
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
    setMobileTab('activity')
  }, [auctionId])

  useEffect(() => {
    if (auction?.status === 'COMPLETED') {
      setBidAmount('')
      setInputError('')
    }
  }, [auction?.status])

  function handleBidSubmit(event) {
    event.preventDefault()
    const amount = parseSafeBidAmount(bidAmount)

    if (amount === null) {
      setInputError(
        'Enter a positive, safe amount using up to two decimal places',
      )
      return
    }

    setInputError('')
    room.clearBidError()
    room.submitBid(amount)
  }

  function handleBidChange(event) {
    const nextValue = event.target.value

    room.clearBidError()

    if (nextValue === '' || PARTIAL_CURRENCY_PATTERN.test(nextValue)) {
      setBidAmount(nextValue)
      setInputError('')
      return
    }

    setInputError('Use digits and no more than two decimal places')
  }

  function handleBidKeyDown(event) {
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      BLOCKED_BID_KEYS.has(event.key)
    ) {
      event.preventDefault()
      setInputError('Scientific notation and signed values are not allowed')
    }
  }

  function handleMobileTabKeyDown(event) {
    const tabButtons = Array.from(
      event.currentTarget.parentElement.querySelectorAll('[role="tab"]'),
    )
    const currentIndex = tabButtons.indexOf(event.currentTarget)
    let nextIndex

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabButtons.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = tabButtons.length - 1
    } else {
      return
    }

    event.preventDefault()
    const nextTab = tabButtons[nextIndex]
    setMobileTab(nextTab.dataset.activityTab)
    nextTab.focus()
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
    auction.status === 'CANCELLED'
      ? 'This auction was cancelled.'
      : auction.status === 'COMPLETED'
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
    <div className="min-h-screen overflow-x-hidden bg-stone-100 text-stone-950">
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
          <section
            className="lg:col-span-5 xl:col-span-3"
            aria-labelledby="auction-title"
          >
            <div className="aspect-[4/3] overflow-hidden border border-stone-200 bg-stone-200">
              {!imageFailed ? (
                <img
                  src={auction.image}
                  alt={auction.title}
                  className="h-full w-full object-cover"
                  onError={() => setFailedImageUrl(auction.image)}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm text-stone-500">
                  Image unavailable
                </div>
              )}
            </div>

            {auction.category ? (
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                {auction.category}
              </p>
            ) : null}
            <h1
              id="auction-title"
              className={`${auction.category ? 'mt-2' : 'mt-6'} break-words text-3xl font-semibold tracking-tight`}
            >
              {auction.title}
            </h1>
            <p className="mt-3 whitespace-pre-wrap break-words leading-7 text-stone-600">
              {auction.description}
            </p>

            <div className="mt-6 border-y border-stone-200 py-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Seller
              </p>
              <p className="mt-2 break-words font-semibold">
                {auction.seller?.name ?? 'BidArena seller'}
              </p>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="flex items-center gap-2 text-stone-500">
                  <CalendarDays size={16} aria-hidden="true" /> Starts
                </dt>
                <dd className="min-w-0 break-words text-right font-medium">
                  {formatDate(auction.startAt)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="flex items-center gap-2 text-stone-500">
                  <CalendarDays size={16} aria-hidden="true" /> Ends
                </dt>
                <dd className="min-w-0 break-words text-right font-medium">
                  {formatDate(auction.endAt)}
                </dd>
              </div>
            </dl>
          </section>

          <section
            className="space-y-6 lg:col-span-7 xl:col-span-5"
            aria-label="Live auction"
          >
            <div className="border border-stone-200 bg-white p-5 sm:p-6">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[auction.status] ?? STATUS_STYLES.COMPLETED}`}
                  >
                    {statusLabel}
                  </span>
                  <AuctionHeatBadge heat={room.auctionHeat} />
                </div>
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

              <div className="mt-8 grid min-w-0 gap-6 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Current highest bid
                  </p>
                  <p
                    className="mt-2 max-w-full break-words text-[clamp(1.75rem,7vw,2.25rem)] font-semibold leading-tight tracking-tight tabular-nums"
                    title={currentBidPresentation.exact}
                  >
                    {currentBidPresentation.display}
                  </p>
                  {auction.status !== 'COMPLETED' ? (
                    <p className="mt-2 text-sm text-stone-500">
                      Minimum next bid: {formatCurrency(minimumNextBid)}
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
                <div className="min-w-0 sm:text-right">
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
                            ? (
                                <span title={winningBidPresentation.exact}>
                                  {winningBidPresentation.display}
                                </span>
                              )
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

              <AuctionPaymentCard
                key={`${auctionId}:${user?.id ?? 'anonymous'}`}
                auctionId={auctionId}
                auction={auction}
                user={user}
                isRestoringSession={isRestoringSession}
                socketPaymentStatus={
                  room.snapshot?.auction?.paymentStatus
                }
              />

              <form
                onSubmit={handleBidSubmit}
                className="mt-8 border-t border-stone-200 pt-6"
                noValidate
              >
                <label className="block text-sm font-medium" htmlFor="bid-amount">
                  Your bid
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="bid-amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    maxLength={19}
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    value={bidAmount}
                    aria-invalid={Boolean(inputError || room.bidError)}
                    aria-describedby={
                      inputError || room.bidError || readOnlyReason
                        ? 'bid-feedback'
                        : undefined
                    }
                    disabled={!canBid || room.isSubmittingBid}
                    placeholder={String(minimumNextBid)}
                    onChange={handleBidChange}
                    onKeyDown={handleBidKeyDown}
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
                  <p
                    id="bid-feedback"
                    className="mt-3 text-sm text-red-700"
                    role="alert"
                  >
                    {inputError || room.bidError}
                  </p>
                ) : readOnlyReason ? (
                  <p
                    id="bid-feedback"
                    className="mt-3 text-sm text-stone-500"
                  >
                    {readOnlyReason}
                  </p>
                ) : null}
              </form>
            </div>

            <div className="hidden space-y-6 xl:block">
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

          <section
            className="min-w-0 lg:col-span-12 xl:col-span-4"
            aria-label="Auction room workspace"
          >
            <div
              className="flex border-b border-stone-300 lg:hidden"
              role="tablist"
              aria-orientation="horizontal"
              aria-label="Auction room sections"
            >
              {MOBILE_ACTIVITY_TABS.map((tab) => (
                <button
                  key={tab}
                  id={`mobile-auction-activity-tab-${tab}`}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab}
                  aria-controls={`mobile-auction-${tab}-panel`}
                  tabIndex={mobileTab === tab ? 0 : -1}
                  data-activity-tab={tab}
                  onClick={() => setMobileTab(tab)}
                  onKeyDown={handleMobileTabKeyDown}
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

            <div
              className="min-w-0 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 xl:grid-cols-1"
            >
              <div
                id="mobile-auction-activity-panel"
                role={usesCompactRoomTabs ? 'tabpanel' : undefined}
                aria-labelledby={
                  usesCompactRoomTabs
                    ? 'mobile-auction-activity-tab-activity'
                    : undefined
                }
                tabIndex={
                  usesCompactRoomTabs && mobileTab === 'activity'
                    ? 0
                    : undefined
                }
                className={`min-w-0 space-y-6 border border-t-0 border-stone-200 bg-white p-5 outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-700 lg:block lg:border-0 lg:bg-transparent lg:p-0 xl:hidden ${
                  mobileTab === 'activity' ? 'block' : 'hidden'
                }`}
              >
                <section className="min-w-0 border border-stone-200 bg-white p-4">
                  <h2 className="font-semibold">Recent bids</h2>
                  <div className="mt-2 max-h-80 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                    <BidList
                      bids={room.snapshot?.latestBids}
                      identities={identities}
                    />
                  </div>
                </section>
                <section className="min-w-0 border border-stone-200 bg-white p-4">
                  <h2 className="font-semibold">Timeline</h2>
                  <div className="mt-2 max-h-80 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                    <TimelineList
                      timeline={room.snapshot?.timeline}
                      identities={identities}
                      auction={auction}
                    />
                  </div>
                </section>
              </div>

              <div
                id="mobile-auction-chat-panel"
                role={usesCompactRoomTabs ? 'tabpanel' : undefined}
                aria-labelledby={
                  usesCompactRoomTabs
                    ? 'mobile-auction-activity-tab-chat'
                    : undefined
                }
                tabIndex={
                  usesCompactRoomTabs && mobileTab === 'chat'
                    ? 0
                    : undefined
                }
                className={`min-w-0 outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-700 lg:block ${
                  mobileTab === 'chat' ? 'block' : 'hidden'
                }`}
              >
                <AuctionChatPanel
                  key={`${auctionId}:${user?.id ?? 'anonymous'}`}
                  messages={room.chatMessages}
                  isLoading={room.isChatHistoryLoading}
                  historyError={room.chatHistoryError}
                  sendError={room.chatSendError}
                  isSending={room.isSendingChat}
                  connectionState={room.connectionState}
                  role={role}
                  isAuthenticated={Boolean(user?.id)}
                  auctionStatus={auction.status}
                  isSelected={
                    !usesCompactRoomTabs || mobileTab === 'chat'
                  }
                  onSend={room.sendChatMessage}
                  onRetry={room.requestChatHistory}
                  onClearSendError={room.clearChatSendError}
                />
              </div>

              <div
                id="mobile-auction-insights-panel"
                role={usesCompactRoomTabs ? 'tabpanel' : undefined}
                aria-labelledby={
                  usesCompactRoomTabs
                    ? 'mobile-auction-activity-tab-insights'
                    : undefined
                }
                tabIndex={
                  usesCompactRoomTabs && mobileTab === 'insights'
                    ? 0
                    : undefined
                }
                className={`min-w-0 outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-700 lg:block ${
                  mobileTab === 'insights' ? 'block' : 'hidden'
                }`}
              >
                <AuctionInsightsPanel
                  stats={room.auctionStats}
                  heat={room.auctionHeat}
                  isLoading={room.isInsightsLoading}
                  error={room.insightsError}
                  onRetry={room.requestAuctionStats}
                  connectionLabel={connectionLabel}
                  connectionState={room.connectionState}
                  role={role}
                  auctionStatus={auction.status}
                />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
