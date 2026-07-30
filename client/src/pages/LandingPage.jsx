import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
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

  return (
    <div
      ref={pageRef}
      className="landing-page min-h-screen overflow-x-hidden bg-stone-100 text-stone-950"
    >
      <MarketplaceHeader />

      <main>
        <section
          data-landing-hero
          className="border-b border-stone-200 bg-white"
        >
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-emerald-800">
                A clearer way to buy and sell by auction
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Discover products and bid as the auction unfolds.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
                BidArena brings listings, live bids, synchronized timers, and
                final outcomes into one focused marketplace experience.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/auctions"
                  className="inline-flex items-center justify-center gap-2 rounded-sm bg-emerald-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                >
                  Browse auctions <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link
                  to={user ? '/auctions/new' : '/register'}
                  className="inline-flex items-center justify-center rounded-sm border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 transition hover:border-emerald-700 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
                >
                  {user ? 'Create an auction' : 'Create an account'}
                </Link>
              </div>
            </div>

            <aside className="rounded-md border border-stone-200 bg-stone-50 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                  <Radio size={20} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold">Live state you can follow</p>
                  <p className="text-sm text-stone-500">From first bid to final result</p>
                </div>
              </div>
              <ul className="mt-6 space-y-4 text-sm leading-6 text-stone-700">
                <li className="flex gap-3">
                  <ShieldCheck
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  The server validates bids and controls the official auction
                  state.
                </li>
                <li className="flex gap-3">
                  <Radio
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  Bid updates, presence, and timers stay synchronized in the
                  live room.
                </li>
                <li className="flex gap-3">
                  <Trophy
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-700"
                    aria-hidden="true"
                  />
                  Completed auctions present the winner and final amount
                  without ambiguity.
                </li>
              </ul>
            </aside>
          </div>
        </section>

        <section
          data-landing-reveal
          className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8"
          aria-labelledby="featured-auctions-heading"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                {featuredLabel}
              </p>
              <h2
                id="featured-auctions-heading"
                className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                {featuredTitle}
              </h2>
              <p className="mt-2 text-stone-600">
                Current marketplace listings, loaded directly from BidArena.
              </p>
            </div>
            <Link
              to="/auctions"
              className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            >
              View marketplace <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          {auctionsAreLoading ? (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <AuctionSkeleton key={index} />
              ))}
            </div>
          ) : null}

          {!auctionsAreLoading && featuredAuctions.length > 0 ? (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {featuredAuctions.map((auction) => (
                <div key={auction._id} data-landing-card className="min-w-0">
                  <AuctionCard auction={auction} />
                </div>
              ))}
            </div>
          ) : null}

          {!auctionsAreLoading && !auctionsFailed && featuredAuctions.length === 0 ? (
            <div className="mt-7 rounded-md border border-stone-200 bg-white px-5 py-10 text-center">
              <h3 className="font-semibold">No live or upcoming auctions yet</h3>
              <p className="mt-2 text-sm text-stone-600">
                Visit the marketplace to review completed listings or create a
                new auction.
              </p>
            </div>
          ) : null}

          {auctionsFailed ? (
            <div
              className="mt-7 rounded-md border border-red-200 bg-red-50 px-5 py-8 text-center"
              role="alert"
            >
              <h3 className="font-semibold text-red-900">
                Marketplace listings are temporarily unavailable
              </h3>
              <p className="mt-2 text-sm text-red-700">
                You can still open the marketplace and try again.
              </p>
            </div>
          ) : null}
        </section>

        <section
          data-landing-reveal
          className="border-y border-stone-200 bg-white"
          aria-labelledby="how-it-works-heading"
        >
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-emerald-800">
                How bidding works
              </p>
              <h2
                id="how-it-works-heading"
                className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                A straightforward path from listing to result
              </h2>
            </div>
            <ol className="mt-9 grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 md:grid-cols-3">
              {BID_STEPS.map(({ icon, title, copy }, index) => (
                <li key={title} className="bg-white p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-800">
                      {createElement(icon, { size: 20, 'aria-hidden': true })}
                    </span>
                    <span className="text-sm font-semibold text-stone-400">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          data-landing-reveal
          className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center lg:px-8"
          aria-labelledby="realtime-trust-heading"
        >
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Realtime, with clear authority
            </p>
            <h2
              id="realtime-trust-heading"
              className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              The auction room reflects the server’s official state.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-stone-600">
              BidArena does not treat a button press as a winning bid. The
              server accepts or rejects each attempt, advances the official
              sequence, and broadcasts the result to connected participants.
            </p>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 sm:grid-cols-2">
            <div className="bg-white p-6">
              <dt className="font-semibold">Synchronized timing</dt>
              <dd className="mt-2 text-sm leading-6 text-stone-600">
                Server time keeps the countdown consistent across auction
                rooms.
              </dd>
            </div>
            <div className="bg-white p-6">
              <dt className="font-semibold">Transparent outcome</dt>
              <dd className="mt-2 text-sm leading-6 text-stone-600">
                Winner and winning amount are recorded when the auction
                completes.
              </dd>
            </div>
          </dl>
        </section>

        <section
          data-landing-reveal
          className="border-t border-stone-200 bg-stone-900 text-white"
        >
          <div className="mx-auto grid max-w-7xl gap-px bg-stone-700/70 lg:grid-cols-2">
            <div className="bg-stone-900 px-4 py-12 sm:px-8 lg:px-12">
              <ListPlus size={24} className="text-emerald-400" aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-semibold">Ready to sell?</h2>
              <p className="mt-3 max-w-lg leading-7 text-stone-300">
                Add product details, set the bidding rules and schedule, then
                manage the listing from your seller dashboard.
              </p>
              <Link
                to={user ? '/auctions/new' : '/register'}
                className="mt-6 inline-flex items-center gap-2 rounded-sm bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900"
              >
                {user ? 'Create an auction' : 'Start selling'}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="bg-stone-900 px-4 py-12 sm:px-8 lg:px-12">
              <Gavel size={24} className="text-emerald-400" aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-semibold">Looking to bid?</h2>
              <p className="mt-3 max-w-lg leading-7 text-stone-300">
                Browse real listings, review the minimum increment, and enter
                the live room when you find the right auction.
              </p>
              <Link
                to="/auctions"
                className="mt-6 inline-flex items-center gap-2 rounded-sm border border-stone-600 px-4 py-2.5 text-sm font-semibold text-white hover:border-emerald-400 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900"
              >
                Explore auctions <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-7 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            <span className="font-semibold text-stone-900">BidArena</span> —
            realtime auctions with clear outcomes.
          </p>
          <nav className="flex gap-5" aria-label="Footer">
            <Link className="hover:text-stone-900" to="/auctions">
              Marketplace
            </Link>
            <Link className="hover:text-stone-900" to={user ? '/profile' : '/login'}>
              {user ? 'Profile' : 'Sign in'}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
