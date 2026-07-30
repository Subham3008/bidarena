import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CircleAlert,
  CreditCard,
  Gavel,
  ListPlus,
  Radio,
  Search,
  ShieldCheck,
  Trophy,
} from 'lucide-react'
import { gsap } from 'gsap'
import { createElement, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

import { AuctionCard } from '../components/AuctionCard.jsx'
import { AuctionSkeleton } from '../components/AuctionSkeleton.jsx'
import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { fetchAuctions } from '../services/auctions.js'

const LIVE_FILTERS = {
  status: 'ACTIVE',
  search: '',
  page: 1,
  limit: 4,
  sort: 'endingSoon',
}

const UPCOMING_FILTERS = {
  ...LIVE_FILTERS,
  status: 'UPCOMING',
  sort: 'newest',
}

const BID_STEPS = [
  {
    icon: Search,
    title: 'Discover a listing',
    copy: 'Browse upcoming and live auctions, then review the product and bidding rules.',
  },
  {
    icon: Gavel,
    title: 'Bid in realtime',
    copy: 'Join the auction room and place a bid while the server keeps every participant in sync.',
  },
  {
    icon: Trophy,
    title: 'See the outcome',
    copy: 'When time expires, the final winner and winning amount are shown clearly.',
  },
]

export function LandingPage() {
  const pageRef = useRef(null)
  const cardsAnimatedRef = useRef(false)
  const { user } = useAuth()
  const liveAuctionsQuery = useQuery({
    queryKey: ['auctions', 'landing', 'live'],
    queryFn: ({ signal }) => fetchAuctions(LIVE_FILTERS, signal),
  })
  const upcomingAuctionsQuery = useQuery({
    queryKey: ['auctions', 'landing', 'upcoming'],
    queryFn: ({ signal }) => fetchAuctions(UPCOMING_FILTERS, signal),
  })

  const liveAuctions = liveAuctionsQuery.data?.auctions ?? []
  const upcomingAuctions = upcomingAuctionsQuery.data?.auctions ?? []
  const featuredAuctions = liveAuctions.length > 0 ? liveAuctions : upcomingAuctions
  const featuredLabel = liveAuctions.length > 0 ? 'Live now' : 'Starting soon'
  const featuredTitle =
    liveAuctions.length > 0 ? 'Auctions open for bidding' : 'Upcoming auctions'
  const auctionsAreLoading =
    featuredAuctions.length === 0 &&
    (liveAuctionsQuery.isPending || upcomingAuctionsQuery.isPending)
  const auctionsFailed =
    featuredAuctions.length === 0 &&
    !auctionsAreLoading &&
    (liveAuctionsQuery.isError || upcomingAuctionsQuery.isError)

  useLayoutEffect(() => {
    const page = pageRef.current

    if (
      !page ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined
    }

    let sectionObserver
    const animationContext = gsap.context(() => {
      gsap.from('[data-landing-hero] > div > *', {
        opacity: 0,
        y: 16,
        duration: 0.55,
        stagger: 0.08,
        ease: 'power2.out',
        clearProps: 'all',
      })

      const sections = gsap.utils.toArray('[data-landing-reveal]')
      gsap.set(sections, { opacity: 0, y: 18 })

      sectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue
            }

            sectionObserver.unobserve(entry.target)
            gsap.to(entry.target, {
              opacity: 1,
              y: 0,
              duration: 0.5,
              ease: 'power2.out',
              clearProps: 'all',
            })
          }
        },
        { threshold: 0.12 },
      )

      sections.forEach((section) => sectionObserver.observe(section))
    }, page)

    return () => {
      sectionObserver?.disconnect()
      animationContext.revert()
    }
  }, [])

  useLayoutEffect(() => {
    const page = pageRef.current

    if (
      !page ||
      cardsAnimatedRef.current ||
      featuredAuctions.length === 0 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined
    }

    cardsAnimatedRef.current = true
    const animationContext = gsap.context(() => {
      gsap.from('[data-landing-card]', {
        opacity: 0,
        y: 12,
        duration: 0.4,
        stagger: 0.06,
        ease: 'power2.out',
        clearProps: 'all',
      })
    }, page)

    return () => animationContext.revert()
  }, [featuredAuctions.length])

  function retryFeaturedAuctions() {
    void Promise.all([
      liveAuctionsQuery.refetch(),
      upcomingAuctionsQuery.refetch(),
    ])
  }

  return (
    <div
      ref={pageRef}
      className="landing-page app-shell"
    >
      <MarketplaceHeader />

      <main>
        <section
          data-landing-hero
          className="border-b border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <div className="app-container grid gap-10 py-14 sm:py-18 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] lg:items-center lg:gap-16 lg:py-24">
            <div className="max-w-3xl">
              <p className="page-kicker">
                A trusted realtime marketplace
              </p>
              <h1 className="mt-4 max-w-3xl text-[clamp(2.6rem,5.6vw,4.75rem)] font-bold leading-[1.02] tracking-[-0.05em] text-stone-950">
                Bid with confidence as every auction unfolds.
              </h1>
              <p className="mt-6 max-w-2xl text-[clamp(1.05rem,1.6vw,1.25rem)] leading-8 text-stone-600">
                Discover real listings, follow server-synchronized bidding, and
                move from first bid to verified winner payment in one clear
                marketplace.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/auctions"
                  className="btn-primary px-5 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
                >
                  Browse auctions <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link
                  to={user ? '/auctions/new' : '/register'}
                  className="btn-secondary px-5 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
                >
                  {user ? 'Create an auction' : 'Create an account'}
                </Link>
              </div>
            </div>

            <aside className="surface-elevated p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-[var(--color-green-soft)] text-[var(--color-green-primary)]">
                  <Radio size={20} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-bold">Built for confident decisions</p>
                  <p className="text-sm text-stone-500">
                    From discovery to verified payment
                  </p>
                </div>
              </div>
              <ul className="mt-6 space-y-5 text-sm leading-6 text-stone-700">
                <li className="flex gap-3 rounded-[var(--radius-md)] bg-white p-3">
                  <ShieldCheck
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  Every accepted bid and final outcome reflects the official
                  server state.
                </li>
                <li className="flex gap-3 rounded-[var(--radius-md)] bg-white p-3">
                  <Radio
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  Bids, presence, chat, and countdowns stay synchronized in the
                  live auction room.
                </li>
                <li className="flex gap-3 rounded-[var(--radius-md)] bg-white p-3">
                  <CreditCard
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  Winner checkout remains gateway-hosted and payment status is
                  confirmed by BidArena.
                </li>
              </ul>
            </aside>
          </div>
        </section>

        <section
          data-landing-reveal
          className="app-container py-14 sm:py-18"
          aria-labelledby="featured-auctions-heading"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="page-kicker">{featuredLabel}</p>
              <h2
                id="featured-auctions-heading"
                className="mt-2 text-2xl font-bold tracking-[-0.025em] sm:text-3xl"
              >
                {featuredTitle}
              </h2>
              <p className="mt-2 max-w-2xl leading-7 text-stone-600">
                Explore current marketplace listings and enter the room when
                you find the right item.
              </p>
            </div>
            <Link
              to="/auctions"
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[var(--radius-sm)] text-sm font-bold text-[var(--color-green-primary)] hover:text-[var(--color-green-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
            >
              View marketplace <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          {auctionsAreLoading ? (
            <div className="mt-8" role="status" aria-label="Loading featured auctions">
              <span className="sr-only">Loading featured auctions…</span>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <AuctionSkeleton key={index} />
                ))}
              </div>
            </div>
          ) : null}

          {!auctionsAreLoading && featuredAuctions.length > 0 ? (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {featuredAuctions.map((auction) => (
                <div key={auction._id} data-landing-card className="min-w-0">
                  <AuctionCard auction={auction} />
                </div>
              ))}
            </div>
          ) : null}

          {!auctionsAreLoading && !auctionsFailed && featuredAuctions.length === 0 ? (
            <div className="surface-card mt-8 px-5 py-11 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-stone-100 text-stone-500">
                <Gavel size={21} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold">
                No live or upcoming auctions yet
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
                Visit the marketplace to review completed listings or create a
                new auction.
              </p>
              <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
                <Link to="/auctions" className="btn-secondary">
                  Browse all auctions
                </Link>
                <Link
                  to={user ? '/auctions/new' : '/register'}
                  className="btn-primary"
                >
                  {user ? 'Create an auction' : 'Create an account'}
                </Link>
              </div>
            </div>
          ) : null}

          {auctionsFailed ? (
            <div
              className="surface-card mt-8 px-5 py-10 text-center"
              role="alert"
            >
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-red-50 text-red-700">
                <CircleAlert size={21} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-stone-950">
                Marketplace listings are temporarily unavailable
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
                Check your connection, then retry the live marketplace feed.
              </p>
              <button
                type="button"
                onClick={retryFeaturedAuctions}
                className="btn-primary mt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)] focus-visible:ring-offset-2"
              >
                Try again
              </button>
            </div>
          ) : null}
        </section>

        <section
          data-landing-reveal
          className="border-y border-[var(--color-border)] bg-[var(--color-surface)]"
          aria-labelledby="how-it-works-heading"
        >
          <div className="app-container py-14 sm:py-18">
            <div className="max-w-2xl">
              <p className="page-kicker">How bidding works</p>
              <h2
                id="how-it-works-heading"
                className="mt-2 text-2xl font-bold tracking-[-0.025em] sm:text-3xl"
              >
                A straightforward path from listing to result
              </h2>
            </div>
            <ol className="mt-9 grid gap-4 md:grid-cols-3">
              {BID_STEPS.map(({ icon, title, copy }, index) => (
                <li key={title} className="surface-card p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-green-soft)] text-[var(--color-green-primary)]">
                      {createElement(icon, { size: 20, 'aria-hidden': true })}
                    </span>
                    <span className="text-sm font-semibold text-stone-400">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          data-landing-reveal
          className="app-container grid gap-10 py-14 sm:py-18 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center"
          aria-labelledby="realtime-trust-heading"
        >
          <div>
            <p className="page-kicker">Realtime, with clear authority</p>
            <h2
              id="realtime-trust-heading"
              className="mt-2 text-2xl font-bold tracking-[-0.025em] sm:text-3xl"
            >
              One shared view of every important auction moment.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-stone-600">
              BidArena keeps participants aligned around accepted bids,
              official timing, final outcomes, and verified winner payment
              status.
            </p>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="surface-card p-5">
              <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-sky-50 text-sky-700">
                <Radio size={18} aria-hidden="true" />
              </span>
              <dt className="mt-4 font-bold">Synchronized timing</dt>
              <dd className="mt-2 text-sm leading-6 text-stone-600">
                Server time keeps every participant aligned with the official
                countdown.
              </dd>
            </div>
            <div className="surface-card p-5">
              <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-amber-50 text-amber-700">
                <Trophy size={18} aria-hidden="true" />
              </span>
              <dt className="mt-4 font-bold">Transparent outcome</dt>
              <dd className="mt-2 text-sm leading-6 text-stone-600">
                Winner and winning amount are recorded when the auction
                completes.
              </dd>
            </div>
            <div className="surface-card p-5">
              <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--color-green-soft)] text-[var(--color-green-primary)]">
                <CreditCard size={18} aria-hidden="true" />
              </span>
              <dt className="mt-4 font-bold">Verified checkout</dt>
              <dd className="mt-2 text-sm leading-6 text-stone-600">
                Winners pay through hosted checkout and BidArena confirms the
                result securely.
              </dd>
            </div>
          </dl>
        </section>

        <section
          data-landing-reveal
          className="border-t border-stone-700 bg-stone-900 text-white"
        >
          <div className="app-container py-14 sm:py-16">
            <div className="mb-9 max-w-2xl">
              <p className="text-sm font-bold text-emerald-400">
                Your next marketplace move
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-[-0.03em]">
                Ready to enter the arena?
              </h2>
              <p className="mt-3 leading-7 text-stone-300">
                List an item with clear terms or discover an auction worth
                following live.
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-stone-700 bg-stone-700 lg:grid-cols-2">
              <div className="bg-stone-900 p-6 sm:p-8 lg:p-10">
                <ListPlus
                  size={24}
                  className="text-emerald-400"
                  aria-hidden="true"
                />
                <h3 className="mt-5 text-2xl font-bold">Ready to sell?</h3>
                <p className="mt-3 max-w-lg leading-7 text-stone-300">
                  Add product details, set the bidding rules and schedule, then
                  manage the listing from your seller dashboard.
                </p>
                <Link
                  to={user ? '/auctions/new' : '/register'}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900"
                >
                  {user ? 'Create an auction' : 'Start selling'}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
              <div className="bg-stone-900 p-6 sm:p-8 lg:p-10">
                <Gavel
                  size={24}
                  className="text-emerald-400"
                  aria-hidden="true"
                />
                <h3 className="mt-5 text-2xl font-bold">Looking to bid?</h3>
                <p className="mt-3 max-w-lg leading-7 text-stone-300">
                  Browse real listings, review the minimum increment, and enter
                  the live room when you find the right auction.
                </p>
                <Link
                  to="/auctions"
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-stone-600 px-4 py-2.5 text-sm font-bold text-white hover:border-emerald-400 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900"
                >
                  Explore auctions <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="app-container flex flex-col gap-5 py-8 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-bold text-stone-900">BidArena</span> — realtime
            auctions with clear, verified outcomes.
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Footer">
            <Link
              className="rounded-sm font-semibold hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)]"
              to="/auctions"
            >
              Marketplace
            </Link>
            {user ? (
              <Link
                className="rounded-sm font-semibold hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)]"
                to="/dashboard"
              >
                Dashboard
              </Link>
            ) : null}
            <Link
              className="rounded-sm font-semibold hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-primary)]"
              to={user ? '/profile' : '/login'}
            >
              {user ? 'Profile' : 'Sign in'}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
