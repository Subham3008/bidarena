import { ArrowUpRight, CalendarClock } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

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

const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
})

function getScheduleLabel(auction) {
  const date = new Date(
    auction.status === 'UPCOMING' ? auction.startAt : auction.endAt,
  )

  if (Number.isNaN(date.getTime())) {
    return 'Schedule unavailable'
  }

  const prefix =
    auction.status === 'UPCOMING'
      ? 'Starts'
      : auction.status === 'ACTIVE'
        ? 'Ends'
        : 'Ended'

  return `${prefix} ${date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`
}

export function AuctionCard({ auction }) {
  const [imageFailed, setImageFailed] = useState(false)
  const displayedBid = auction.currentBid ?? auction.startBid

  return (
    <article className="overflow-hidden rounded-md border border-stone-200 bg-white">
      <div className="aspect-[4/3] bg-stone-100">
        {!imageFailed ? (
          <img
            src={auction.image}
            alt={auction.title}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="grid h-full place-items-center px-4 text-center text-sm text-stone-500">
            Image unavailable
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-stone-950">
              {auction.title}
            </h2>
            <p className="mt-1 truncate text-sm text-stone-500">
              by {auction.seller?.name ?? 'BidArena seller'}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[auction.status]}`}
          >
            {STATUS_LABELS[auction.status]}
          </span>
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              {auction.bidCount > 0 ? 'Current bid' : 'Starting bid'}
            </p>
            <p className="mt-1 text-xl font-semibold text-stone-950">
              {numberFormatter.format(displayedBid)}
            </p>
          </div>
          <p className="text-sm text-stone-500">
            {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
          </p>
        </div>

        <p className="mt-4 flex items-center gap-2 border-t border-stone-100 pt-4 text-sm text-stone-600">
          <CalendarClock size={16} aria-hidden="true" />
          {getScheduleLabel(auction)}
        </p>

        <Link
          to={`/auctions/${auction._id}`}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 transition hover:border-emerald-700 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
        >
          View auction
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
