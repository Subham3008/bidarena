import {
  ArrowDown,
  Flame,
  MessageCircle,
  Radio,
  RefreshCw,
  Send,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { MAX_CHAT_MESSAGE_LENGTH } from '../hooks/useAuctionRoom.js'
import { getCurrencyPresentation } from '../utils/currency.js'

const CHAT_ROLES = new Set(['SELLER', 'BIDDER'])
const CHARACTER_COUNT_THRESHOLD = 240
const NEAR_BOTTOM_THRESHOLD = 80

const HEAT_STYLES = {
  COLD: 'bg-sky-50 text-sky-800 ring-sky-200',
  WARM: 'bg-amber-50 text-amber-900 ring-amber-200',
  HOT: 'bg-rose-50 text-rose-800 ring-rose-200',
}

const STATUS_LABELS = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Live',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const compactNumberFormatter = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const exactNumberFormatter = new Intl.NumberFormat('en-IN')

function formatMessageTime(value) {
  if (!value) {
    return 'Time unavailable'
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : date.toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

function formatLastBidTime(value, bidCount) {
  if (!value) {
    return bidCount === 0 ? 'No bids yet' : '—'
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

function numberPresentation(value) {
  if (!Number.isFinite(value) || value < 0) {
    return { display: '—', exact: '' }
  }

  return {
    display: compactNumberFormatter.format(value),
    exact: exactNumberFormatter.format(value),
  }
}

function senderInitials(name) {
  return (name || 'Participant')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function renderedMessageKey(message) {
  if (!message) {
    return ''
  }

  return (
    message.id ??
    `${message.sender.id ?? 'participant'}-${message.clientMessageId ?? message.createdAt}-${message.text}`
  )
}

function ChatAvatar({ sender }) {
  return (
    <span
      className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-50 text-[0.65rem] font-semibold text-emerald-800 ring-1 ring-emerald-200"
      aria-hidden="true"
    >
      {senderInitials(sender.name)}
      {sender.avatarUrl ? (
        <img
          src={sender.avatarUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => event.currentTarget.remove()}
        />
      ) : null}
    </span>
  )
}

export function AuctionHeatBadge({ heat }) {
  const level = heat?.level

  if (!HEAT_STYLES[level]) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600 ring-1 ring-inset ring-stone-200">
        <Flame size={13} aria-hidden="true" />
        Heat pending
      </span>
    )
  }

  const label = level[0] + level.slice(1).toLowerCase()

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${HEAT_STYLES[level]}`}
      aria-label={`Auction heat: ${label}`}
    >
      <Flame size={13} aria-hidden="true" />
      Heat: {label}
    </span>
  )
}

export function AuctionChatPanel({
  messages,
  isLoading,
  historyError,
  sendError,
  isSending,
  connectionState,
  role,
  isAuthenticated,
  auctionStatus,
  isSelected,
  onSend,
  onRetry,
  onClearSendError,
}) {
  const [draft, setDraft] = useState('')
  const [localError, setLocalError] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const messageLogRef = useRef(null)
  const isNearBottomRef = useRef(true)
  const previousLatestMessageRef = useRef('')
  const textareaId = useId()
  const feedbackId = `${textareaId}-feedback`
  const characterCountId = `${textareaId}-count`
  const canWrite = isAuthenticated && CHAT_ROLES.has(role)
  const trimmedDraft = draft.trim()
  const characterCount = trimmedDraft.length
  const showCharacterCount =
    characterCount >= CHARACTER_COUNT_THRESHOLD
  const isConnected = connectionState === 'connected'
  const hasInvalidLength =
    trimmedDraft.length > MAX_CHAT_MESSAGE_LENGTH
  const canSubmit =
    canWrite &&
    isConnected &&
    !isSending &&
    Boolean(trimmedDraft) &&
    !hasInvalidLength
  const latestMessageKey = renderedMessageKey(messages.at(-1))

  useEffect(() => {
    const messageLog = messageLogRef.current
    const previousLatestMessage = previousLatestMessageRef.current
    previousLatestMessageRef.current = latestMessageKey

    if (
      !messageLog ||
      !latestMessageKey ||
      latestMessageKey === previousLatestMessage
    ) {
      return undefined
    }

    if (isNearBottomRef.current) {
      const frame = window.requestAnimationFrame(() => {
        messageLog.scrollTop = messageLog.scrollHeight
        setUnreadCount(0)
      })

      return () => window.cancelAnimationFrame(frame)
    }

    setUnreadCount((current) => current + 1)
    return undefined
  }, [latestMessageKey])

  useEffect(() => {
    const messageLog = messageLogRef.current

    if (!isSelected || !messageLog || !isNearBottomRef.current) {
      return undefined
    }

    const frame = window.requestAnimationFrame(() => {
      messageLog.scrollTop = messageLog.scrollHeight
      setUnreadCount(0)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isSelected])

  function handleLogScroll() {
    const messageLog = messageLogRef.current

    if (!messageLog) {
      return
    }

    const distanceFromBottom =
      messageLog.scrollHeight -
      messageLog.scrollTop -
      messageLog.clientHeight
    isNearBottomRef.current =
      distanceFromBottom <= NEAR_BOTTOM_THRESHOLD

    if (isNearBottomRef.current) {
      setUnreadCount(0)
    }
  }

  function scrollToLatest() {
    const messageLog = messageLogRef.current

    if (!messageLog) {
      return
    }

    messageLog.scrollTop = messageLog.scrollHeight
    isNearBottomRef.current = true
    setUnreadCount(0)
  }

  function handleDraftChange(event) {
    setDraft(event.target.value)
    setLocalError('')
    onClearSendError()
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!trimmedDraft) {
      setLocalError('Enter a message before sending')
      return
    }

    if (hasInvalidLength) {
      setLocalError(
        `Messages must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer`,
      )
      return
    }

    if (onSend(trimmedDraft)) {
      setDraft('')
      setLocalError('')
    }
  }

  const readOnlyMessage = !isAuthenticated
    ? 'Only signed-in sellers and bidders can send messages. Spectators can still follow the conversation.'
    : !CHAT_ROLES.has(role)
      ? role === 'SPECTATOR'
        ? 'Chat is read-only for your current room role.'
        : 'Chat is read-only until the server provides an eligible room role.'
      : ''

  return (
    <section
      className="flex h-[min(34rem,70dvh)] min-h-[18rem] min-w-0 flex-col border border-stone-200 bg-white sm:min-h-[26rem]"
      aria-labelledby="auction-chat-heading"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div className="min-w-0">
          <h2
            id="auction-chat-heading"
            className="flex items-center gap-2 font-semibold"
          >
            <MessageCircle size={17} aria-hidden="true" />
            Auction chat
          </h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Latest 50 messages
          </p>
        </div>
        {isLoading ? (
          <span className="text-xs font-medium text-stone-500" role="status">
            Refreshing…
          </span>
        ) : null}
      </div>

      {connectionState !== 'connected' ? (
        <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {connectionState === 'disconnected'
            ? 'Chat is disconnected. Existing messages remain available.'
            : 'Reconnecting to chat. Existing messages remain available.'}
        </p>
      ) : null}

      {historyError ? (
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800"
          role="alert"
        >
          <span className="min-w-0 break-words">{historyError}</span>
          <button
            type="button"
            onClick={onRetry}
            disabled={!isConnected}
            className="inline-flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={12} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <ol
          ref={messageLogRef}
          className="h-full min-w-0 overflow-y-auto overscroll-contain px-4 [scrollbar-gutter:stable]"
          role="log"
          aria-label="Auction chat messages"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={isLoading}
          onScroll={handleLogScroll}
        >
          {isLoading && messages.length === 0 ? (
            <li className="py-10 text-center text-sm text-stone-500">
              Loading chat history…
            </li>
          ) : null}
          {!isLoading && messages.length === 0 && !historyError ? (
            <li className="py-10 text-center text-sm text-stone-500">
              No messages yet. Start the conversation when your role allows it.
            </li>
          ) : null}
          {messages.map((message) => (
            <li
              key={
                renderedMessageKey(message)
              }
              className="flex min-w-0 gap-2.5 border-b border-stone-100 py-3 last:border-b-0"
            >
              <ChatAvatar sender={message.sender} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="max-w-full break-words text-sm font-semibold text-stone-900 [overflow-wrap:anywhere]">
                    {message.sender.name}
                  </p>
                  <time
                    className="text-[0.68rem] text-stone-500"
                    dateTime={message.createdAt ?? undefined}
                  >
                    {formatMessageTime(message.createdAt)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-stone-700 [overflow-wrap:anywhere]">
                  {message.text}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={scrollToLatest}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          >
            <ArrowDown size={13} aria-hidden="true" />
            {unreadCount} new {unreadCount === 1 ? 'message' : 'messages'}
          </button>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-stone-200 p-4">
        {readOnlyMessage ? (
          <p className="text-sm leading-5 text-stone-600">
            {readOnlyMessage}{' '}
            {!isAuthenticated ? (
              <Link
                to="/login"
                className="font-semibold text-emerald-800 underline underline-offset-2"
              >
                Sign in
              </Link>
            ) : null}
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {auctionStatus === 'COMPLETED' ? (
              <p className="mb-2 text-xs text-stone-500">
                The auction is complete; room chat remains available for your role.
              </p>
            ) : null}
            <label
              htmlFor={textareaId}
              className="text-sm font-medium text-stone-800"
            >
              Message the room
            </label>
            <textarea
              id={textareaId}
              rows="2"
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
              value={draft}
              disabled={isSending}
              placeholder={
                isConnected
                  ? 'Write a message…'
                  : 'You can keep drafting while chat reconnects'
              }
              aria-invalid={Boolean(localError || sendError)}
              aria-describedby={[
                localError || sendError ? feedbackId : '',
                showCharacterCount ? characterCountId : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined}
              onChange={handleDraftChange}
              className="mt-2 block w-full resize-none rounded-sm border border-stone-300 px-3 py-2 text-sm leading-5 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 disabled:bg-stone-100"
            />
            <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                {showCharacterCount ? (
                  <p
                    id={characterCountId}
                    className={`text-xs tabular-nums ${
                      hasInvalidLength ? 'text-red-700' : 'text-stone-500'
                    }`}
                  >
                    {characterCount}/{MAX_CHAT_MESSAGE_LENGTH}
                  </p>
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex shrink-0 items-center gap-2 rounded-sm bg-emerald-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                <Send size={14} aria-hidden="true" />
                {isSending ? 'Sending…' : 'Send'}
              </button>
            </div>
            {localError || sendError ? (
              <p
                id={feedbackId}
                className="mt-2 break-words text-sm text-red-700"
                role="alert"
              >
                {localError || sendError}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </section>
  )
}

function Metric({ label, presentation, className = '' }) {
  return (
    <div
      className={`min-w-0 border border-stone-200 bg-stone-50 p-3 ${className}`}
    >
      <dt className="text-xs leading-4 text-stone-500">{label}</dt>
      <dd
        className="mt-1.5 min-w-0 break-words text-lg font-semibold tabular-nums text-stone-900 [overflow-wrap:anywhere]"
        title={presentation.exact || undefined}
      >
        {presentation.display}
      </dd>
    </div>
  )
}

export function AuctionInsightsPanel({
  stats,
  heat,
  isLoading,
  error,
  onRetry,
  connectionLabel,
  connectionState,
  role,
  auctionStatus,
}) {
  const bidderCount = numberPresentation(stats?.bidderCount)
  const spectatorCount = numberPresentation(stats?.spectatorCount)
  const uniqueBidderCount = numberPresentation(
    stats?.uniqueBidderCount,
  )
  const bidCount = numberPresentation(stats?.bidCount)
  const velocity = numberPresentation(stats?.bidVelocityPerMinute)
  const currentBid = Number.isFinite(stats?.currentBid)
    ? getCurrencyPresentation(stats.currentBid)
    : { display: '—', exact: '' }
  const status = stats?.status ?? auctionStatus
  const roleText = {
    SELLER: 'You are the seller. Bidding is disabled.',
    BIDDER:
      auctionStatus === 'COMPLETED'
        ? 'You joined as a bidder. This auction is complete.'
        : 'You can bid while the auction is active.',
    SPECTATOR: 'You are viewing this auction in read-only mode.',
  }

  return (
    <section
      className="min-w-0 border border-stone-200 bg-white p-4"
      aria-labelledby="auction-insights-heading"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="auction-insights-heading" className="font-semibold">
            Live insights
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Server-authoritative room activity
          </p>
        </div>
        <AuctionHeatBadge heat={heat} />
      </div>

      <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2 border-y border-stone-200 py-3">
        <span
          className={`inline-flex items-center gap-2 text-sm font-medium ${
            connectionState === 'connected'
              ? 'text-emerald-800'
              : 'text-amber-800'
          }`}
        >
          <Radio size={14} aria-hidden="true" />
          {connectionLabel}
        </span>
        <span className="max-w-full break-words rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 ring-1 ring-inset ring-stone-200">
          {role ?? 'Synchronising'}
        </span>
      </div>

      <p className="mt-3 text-sm leading-5 text-stone-600">
        {roleText[role] ?? 'Waiting for the server-provided room role.'}
      </p>

      {isLoading && stats ? (
        <p className="mt-3 text-xs font-medium text-stone-500" role="status">
          Refreshing authoritative statistics…
        </p>
      ) : null}

      {error ? (
        <div
          className="mt-4 flex min-w-0 items-center justify-between gap-3 border border-red-200 bg-red-50 p-3 text-xs text-red-800"
          role="alert"
        >
          <span className="min-w-0 break-words">{error}</span>
          <button
            type="button"
            onClick={onRetry}
            disabled={connectionState !== 'connected'}
            className="inline-flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={12} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : null}

      {isLoading && !stats ? (
        <p className="py-8 text-center text-sm text-stone-500" role="status">
          Loading authoritative statistics…
        </p>
      ) : (
        <dl className="mt-4 grid min-w-0 grid-cols-2 gap-2.5">
          <Metric label="Current bid" presentation={currentBid} className="col-span-2" />
          <Metric label="Bidders online" presentation={bidderCount} />
          <Metric label="Spectators online" presentation={spectatorCount} />
          <Metric label="Unique bidders" presentation={uniqueBidderCount} />
          <Metric label="Accepted bids" presentation={bidCount} />
          <Metric
            label="Bid velocity / min"
            presentation={{
              ...velocity,
              display:
                velocity.display === '—'
                  ? velocity.display
                  : `${velocity.display}/min`,
            }}
          />
          <Metric
            label="Auction status"
            presentation={{
              display: status
                ? STATUS_LABELS[status] ?? status
                : '—',
              exact: '',
            }}
          />
          <div className="col-span-2 min-w-0 border border-stone-200 bg-stone-50 p-3">
            <dt className="text-xs text-stone-500">Last accepted bid</dt>
            <dd className="mt-1.5 break-words text-sm font-semibold text-stone-900">
              {formatLastBidTime(stats?.lastBidAt, stats?.bidCount)}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-3 text-xs leading-5 text-stone-500">
        {heat?.level
          ? `${heat.level[0] + heat.level.slice(1).toLowerCase()} heat reflects ${
              Number.isFinite(heat.recentBidCount)
                ? exactNumberFormatter.format(heat.recentBidCount)
                : 'the latest'
            } accepted bids in the server’s ${
              Number.isFinite(heat.windowSeconds)
                ? `${heat.windowSeconds}-second`
                : 'recent'
            } window.`
          : 'Waiting for the server-provided auction heat.'}
      </p>
    </section>
  )
}
