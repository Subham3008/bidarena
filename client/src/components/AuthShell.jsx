import { Gavel, Radio, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

export function AuthShell({ title, description, alternateText, alternateLink, children }) {
  return (
    <main className="app-shell grid min-h-dvh place-items-center px-4 py-8 sm:px-6 sm:py-12">
      <section className="surface-elevated grid w-full max-w-5xl overflow-hidden lg:grid-cols-[minmax(19rem,0.8fr)_minmax(0,1fr)]">
        <aside className="relative hidden overflow-hidden bg-stone-900 p-9 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-3 rounded-md text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-4 focus-visible:ring-offset-stone-900"
              aria-label="BidArena home"
            >
              <span className="grid h-10 w-10 place-items-center rounded-md bg-emerald-600 text-white">
                <Gavel size={20} aria-hidden="true" />
              </span>
              BidArena
            </Link>
            <p className="mt-12 max-w-sm text-3xl font-semibold leading-tight tracking-tight">
              Enter a marketplace that stays in sync.
            </p>
            <p className="mt-4 max-w-sm leading-7 text-stone-300">
              Follow authoritative bids, live timing, clear outcomes, and
              verified winner payments in one focused auction room.
            </p>
          </div>
          <ul className="mt-12 space-y-4 text-sm text-stone-300">
            <li className="flex items-center gap-3">
              <Radio
                size={17}
                className="text-emerald-400"
                aria-hidden="true"
              />
              Realtime room updates
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck
                size={17}
                className="text-emerald-400"
                aria-hidden="true"
              />
              Server-verified outcomes and payments
            </li>
          </ul>
        </aside>

        <div className="bg-white p-6 sm:p-9 lg:p-11">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md font-bold tracking-tight text-stone-950 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 lg:hidden"
            aria-label="BidArena home"
          >
            <span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-700 text-white">
              <Gavel size={18} aria-hidden="true" />
            </span>
            Bid<span className="text-emerald-800">Arena</span>
          </Link>
          <p className="page-kicker mt-8 lg:mt-0">Welcome to BidArena</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-lg leading-7 text-stone-600">
            {description}
          </p>

          <div className="mt-8">{children}</div>

          <p className="mt-7 border-t border-stone-200 pt-6 text-sm text-stone-600">
            {alternateText}{' '}
            <Link
              to={alternateLink.to}
              className="font-semibold text-emerald-800 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            >
              {alternateLink.label}
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
