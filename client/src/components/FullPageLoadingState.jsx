import { Gavel, LoaderCircle } from 'lucide-react'

export function FullPageLoadingState({ message = 'Loading BidArena…' }) {
  return (
    <main className="app-shell grid min-h-dvh place-items-center px-4">
      <div className="text-center" role="status" aria-live="polite">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[var(--color-green-primary)] text-white shadow-sm">
          <Gavel size={22} aria-hidden="true" />
        </span>
        <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-stone-700">
          <LoaderCircle
            size={16}
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {message}
        </p>
      </div>
    </main>
  )
}
