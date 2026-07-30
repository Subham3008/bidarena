import { ArrowUpRight, CalendarClock, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { getCurrencyPresentation } from '../utils/currency.js'

const STATUS_LABELS = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Live now',
  COMPLETED: 'Completed',
}

const STATUS_STYLES = {
  UPCOMING: 'bg-amber-50 text-amber-800 ring-amber-200',
  ACTIVE: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  COMPLETED: 'bg-stone-100 text-stone-700 ring-stone-200',
}

function getSchedule(auction) {
  const value = auction.status === 'UPCOMING' ? auction.startAt : auction.endAt
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return { label: 'Schedule unavailable', dateTime: undefined }
  }

  const prefix =
    auction.status === 'UPCOMING'
      ? 'Starts'
      : auction.status === 'ACTIVE'
        ? 'Ends'
        : 'Ended'

  return {
    label: `${prefix} ${date.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    })}`,
    dateTime: date.toISOString(),
  }
}

export function AuctionCard({ auction, className = '' }) {
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const imageFailed = failedImageUrl === auction.image
  const bidCount = auction.bidCount ?? 0
  const priceLabel = bidCount > 0 ? 'Current bid' : 'Starting bid'
  const price = getCurrencyPresentation(
    auction.currentBid ?? auction.startBid,
  )
  const schedule = getSchedule(auction)

  return (
    <article
      data-auction-card
      className={`surface-card h-full min-w-0 overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[var(--shadow-raised)] motion-reduce:transform-none motion-reduce:transition-none ${className}`}
    >
      <Link
        to={`/auctions/${auction._id}`}
        className="group flex h-full min-w-0 flex-col rounded-[var(--radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-green-primary)]"
        aria-label={`View ${auction.title}`}
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-stone-100">
          {!imageFailed && auction.image ? (
            <img
              src={auction.image}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
              loading="lazy"
              onError={() => setFailedImageUrl(auction.image)}
            />
          ) : (
            <div className="grid h-full place-items-center px-4 text-center text-sm font-medium text-stone-500">
              Image unavailable
            </div>
          )}
          <span
            className={`absolute left-3 top-3 rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 ring-inset ${STATUS_STYLES[auction.status] ?? STATUS_STYLES.COMPLETED}`}
          >
            {STATUS_LABELS[auction.status] ?? auction.status}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="min-w-0">
            <h2 className="line-clamp-2 min-h-13 text-lg font-bold leading-[1.45] tracking-[-0.015em] text-stone-950 transition group-hover:text-[var(--color-green-hover)]">
              {auction.title}
            </h2>
            <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-stone-500">
              <UserRound size={15} className="shrink-0" aria-hidden="true" />
              <span className="truncate">
                {auction.seller?.name ?? 'BidArena seller'}
              </span>
            </p>
          </div>

          <div className="mt-5 flex min-w-0 items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                {priceLabel}
              </p>
              <p
                className="mt-1.5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-2xl font-bold leading-tight tracking-[-0.025em] text-stone-950 tabular-nums"
                title={price.exact}
                aria-label={`${priceLabel}: ${price.exact}`}
              >
                {price.display}
              </p>
            </div>
            <p className="shrink-0 pb-0.5 text-sm font-medium text-stone-500 tabular-nums">
              {bidCount} {bidCount === 1 ? 'bid' : 'bids'}
            </p>
          </div>

          <div className="mt-auto pt-5">
            <p className="flex min-h-16 items-start gap-2 rounded-[var(--radius-md)] bg-stone-50 px-3 py-3 text-sm leading-5 text-stone-600">
              <CalendarClock
                size={16}
                className="mt-0.5 shrink-0 text-stone-500"
                aria-hidden="true"
              />
              {schedule.dateTime ? (
                <time dateTime={schedule.dateTime}>{schedule.label}</time>
              ) : (
                schedule.label
              )}
            </p>

            <span
              className="btn-secondary mt-4 w-full group-hover:border-[var(--color-green-primary)] group-hover:text-[var(--color-green-hover)]"
            >
              View auction
              <ArrowUpRight size={16} aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  )
}
