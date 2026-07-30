import {
  ArrowDown,
  Eye,
  Flame,
  Gauge,
  Gavel,
  MessageCircle,
  Radio,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
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
    : date.toLocaleTimeString([], {
        timeStyle: 'short',
      })
}

function messageDayKey(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? ''
    : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatMessageDay(value) {
  if (!value) {
    return 'Earlier'
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? 'Earlier'
    : date.toLocaleDateString([], {
        dateStyle: 'medium',
      })
}

function latestMessagePreview(message) {
  if (!message) {
    return 'No messages yet'
  }

  const text = message.text.replace(/\s+/g, ' ').trim()
  return `${message.sender.name}: ${text || 'Message'}`
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
  currentUserId,
  sellerId,
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
  const latestMessage = messages.at(-1)
  const connectionLabel =
    {
      connected: 'Connected',
      connecting: 'Connecting',
      reconnecting: 'Reconnecting',
      disconnected: 'Disconnected',
    }[connectionState] ?? 'Connecting'
  const roleLabel =
    {
      SELLER: 'Seller access',
      BIDDER: 'Bidder access',
      SPECTATOR: 'Read-only',
    }[role] ?? 'Checking access'

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

  function handleComposerKeyDown(event) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }

    event.preventDefault()

    if (canSubmit) {
      event.currentTarget.form?.requestSubmit?.()
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
      className="surface-card flex h-[min(42rem,76dvh)] min-h-[22rem] min-w-0 flex-col overflow-hidden sm:min-h-[30rem]"
      aria-labelledby="auction-chat-heading"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-green-soft)] text-[var(--color-green-primary)]">
            <MessageCircle size={19} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="auction-chat-heading" className="font-semibold">
              Auction chat
            </h2>
            <p
              className="mt-0.5 truncate text-xs text-stone-500"
              title={latestMessagePreview(latestMessage)}
            >
              {latestMessagePreview(latestMessage)}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`flex items-center justify-end gap-1.5 text-xs font-semibold ${
              connectionState === 'connected'
                ? 'text-emerald-800'
                : 'text-amber-800'
            }`}
            role="status"
          >
            <Radio size={12} aria-hidden="true" />
            {isLoading ? 'Refreshing…' : connectionLabel}
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            {roleLabel} · latest 50
          </p>
        </div>
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

      <div className="chat-canvas relative min-h-0 flex-1">
        <ol
          ref={messageLogRef}
          className="soft-scrollbar h-full min-w-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 [scrollbar-gutter:stable]"
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
          {messages.map((message, index) => {
            const messageKey = renderedMessageKey(message)
            const isOwnMessage = Boolean(
              currentUserId &&
                message.sender.id &&
                currentUserId === message.sender.id,
            )
            const isSellerMessage = Boolean(
              sellerId &&
                message.sender.id &&
                sellerId === message.sender.id,
            )
            const showDaySeparator =
              index === 0 ||
              messageDayKey(messages[index - 1]?.createdAt) !==
                messageDayKey(message.createdAt)

            return (
              <Fragment key={messageKey}>
                {showDaySeparator ? (
                  <li
                    className="flex justify-center py-3"
                    role="separator"
                    aria-label={formatMessageDay(message.createdAt)}
                  >
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-stone-500 shadow-sm ring-1 ring-stone-200">
                      {formatMessageDay(message.createdAt)}
                    </span>
                  </li>
                ) : null}
                <li
                  className={`flex min-w-0 items-end gap-2 py-1 ${
                    isOwnMessage ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isOwnMessage ? (
                    <ChatAvatar sender={message.sender} />
                  ) : null}
                  <div
                    className={`min-w-0 max-w-[84%] rounded-[var(--radius-lg)] px-3 py-2 shadow-sm sm:max-w-[78%] ${
                      isOwnMessage
                        ? 'rounded-br-sm bg-[var(--color-green-primary)] text-white'
                        : 'rounded-bl-sm bg-white text-stone-800 ring-1 ring-stone-200'
                    }`}
                  >
                    {isOwnMessage ? (
                      <span className="sr-only">You said: </span>
                    ) : null}
                    {!isOwnMessage ? (
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <p className="max-w-full break-words text-xs font-semibold text-stone-900 [overflow-wrap:anywhere]">
                          {message.sender.name}
                        </p>
                        <span
                          className={`text-xs font-medium ${
                            isSellerMessage
                              ? 'text-emerald-700'
                              : 'text-stone-500'
                          }`}
                        >
                          {isSellerMessage ? 'Seller' : 'Bidder'}
                        </span>
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words text-sm leading-5 [overflow-wrap:anywhere]">
                      {message.text}
                    </p>
                    <time
                      className={`mt-1 block text-right text-xs ${
                        isOwnMessage ? 'text-emerald-100' : 'text-stone-500'
                      }`}
                      dateTime={message.createdAt ?? undefined}
                    >
                      {formatMessageTime(message.createdAt)}
                    </time>
                  </div>
                </li>
              </Fragment>
            )
          })}
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

      <div className="shrink-0 border-t border-stone-200 bg-white p-4">
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
              onKeyDown={handleComposerKeyDown}
              className="field-control mt-2 block !min-h-[4.25rem] w-full resize-none !rounded-[var(--radius-md)] text-sm leading-5"
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
                className="btn-primary shrink-0 px-4"
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

function Metric({ label, presentation, icon }) {
  return (
    <div className="min-w-0 p-2.5">
      <dt className="flex items-center gap-1.5 text-xs leading-4 text-stone-500">
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
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
      className="surface-card min-w-0 p-4"
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
        <span className="max-w-full break-words text-xs font-semibold text-stone-600">
          {role
            ? role[0] + role.slice(1).toLowerCase()
            : 'Synchronising'}
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
        <dl className="mt-4 min-w-0">
          <div className="rounded-[var(--radius-md)] bg-[var(--color-green-soft)] p-4 ring-1 ring-inset ring-emerald-200">
            <dt className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <Gavel size={16} aria-hidden="true" />
              Current bid
            </dt>
            <dd
              className="mt-2 break-words text-2xl font-bold tracking-tight tabular-nums text-stone-950 [overflow-wrap:anywhere]"
              title={currentBid.exact || undefined}
            >
              {currentBid.display}
            </dd>
          </div>

          <div className="surface-muted mt-3 grid min-w-0 grid-cols-2 p-1">
            <Metric
              label="Bidders online"
              presentation={bidderCount}
              icon={<Users size={13} />}
            />
            <Metric
              label="Spectators online"
              presentation={spectatorCount}
              icon={<Eye size={13} />}
            />
            <Metric
              label="Unique bidders"
              presentation={uniqueBidderCount}
              icon={<Users size={13} />}
            />
            <Metric
              label="Accepted bids"
              presentation={bidCount}
              icon={<Gavel size={13} />}
            />
            <Metric
              label="Bid velocity"
              icon={<Gauge size={13} />}
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
              icon={<Radio size={13} />}
              presentation={{
                display: status
                  ? STATUS_LABELS[status] ?? status
                  : '—',
                exact: '',
              }}
            />
          </div>

          <div className="mt-3 min-w-0 border-t border-stone-200 pt-3">
            <dt className="text-xs text-stone-500">Last accepted bid</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-stone-900">
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
