import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AuctionForm } from '../components/AuctionForm.jsx'
import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { createAuction } from '../services/auctions.js'

export function CreateAuctionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const mutation = useMutation({ mutationFn: createAuction })

  async function handleCreate(auction) {
    const createdAuction = await mutation.mutateAsync(auction)

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['auctions'] }),
      queryClient.invalidateQueries({ queryKey: ['my-auctions'] }),
    ])
    toast.success('Auction created successfully')
    navigate(`/auctions/${createdAuction._id}`)
  }

  return (
    <div className="app-shell">
      <MarketplaceHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-stone-600 hover:text-stone-950 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to dashboard
        </Link>

        <header className="mt-6 max-w-3xl">
          <p className="page-kicker">New listing</p>
          <h1 className="page-title mt-2">Create an auction</h1>
          <p className="page-description mt-3">
            Add accurate item details, upload a clear image, and choose a
            reliable schedule.
          </p>
        </header>

        <AuctionForm
          onSubmit={handleCreate}
          submitLabel="Create auction"
          submittingLabel="Creating auction…"
          cancelTo="/dashboard"
        />
      </main>
    </div>
  )
}
