import { Link } from 'react-router-dom'

export function AuthShell({ title, description, alternateText, alternateLink, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-12 text-stone-950">
      <section className="w-full max-w-md border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <Link
          to="/"
          className="text-sm font-semibold tracking-wide text-emerald-800"
        >
          BidArena
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>

        <div className="mt-7">{children}</div>

        <p className="mt-6 text-sm text-stone-600">
          {alternateText}{' '}
          <Link
            to={alternateLink.to}
            className="font-medium text-emerald-800 underline-offset-4 hover:underline"
          >
            {alternateLink.label}
          </Link>
        </p>
      </section>
    </main>
  )
}
