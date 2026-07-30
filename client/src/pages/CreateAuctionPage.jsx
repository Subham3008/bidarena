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
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <MarketplaceHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to dashboard
        </Link>

        <header className="mt-6 max-w-2xl">
          <p className="text-sm font-semibold text-emerald-800">New listing</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create an auction</h1>
          <p className="mt-2 text-stone-600">
            Add accurate item details, upload a clear image, and choose a reliable schedule.
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
