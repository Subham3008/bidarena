import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { AuctionForm } from '../components/AuctionForm.jsx'
import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { useAuctionManagementEligibility } from '../hooks/useAuctionManagementEligibility.js'
import { useAuth } from '../hooks/useAuth.js'
import { fetchAuction, updateAuction } from '../services/auctions.js'
import { toDateTimeLocal } from '../utils/dates.js'

function StateMessage({ title, message, auctionId }) {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <MarketplaceHeader />
      <main className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <span className="mx-auto grid h-12 w-12 place-items-center bg-stone-200 text-stone-700">
          <LockKeyhole size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        <p className="mx-auto mt-2 max-w-lg text-stone-600">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/dashboard"
            className="rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          >
            Back to dashboard
          </Link>
          {auctionId ? (
            <Link
              to={`/auctions/${auctionId}`}
              className="rounded-sm bg-emerald-800 px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              View auction
            </Link>
          ) : null}
        </div>
      </main>
    </div>
  )
}

export function EditAuctionPage() {
  const { auctionId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const auctionQuery = useQuery({
    queryKey: ['auction', auctionId],
    queryFn: ({ signal }) => fetchAuction(auctionId, signal),
  })
  const mutation = useMutation({ mutationFn: updateAuction })
  const canManage = useAuctionManagementEligibility(auctionQuery.data)

  if (auctionQuery.isPending) {
    return (
      <div className="min-h-screen bg-stone-100 text-stone-950">
        <MarketplaceHeader />
        <main className="mx-auto max-w-4xl animate-pulse px-4 py-10 sm:px-6" aria-label="Loading auction editor">
          <div className="h-4 w-36 bg-stone-200" />
          <div className="mt-7 h-10 w-72 max-w-full bg-stone-200" />
          <div className="mt-8 h-80 border border-stone-200 bg-white" />
        </main>
      </div>
    )
  }

  if (auctionQuery.isError) {
    return (
      <StateMessage
        title="Auction unavailable"
        message="This auction could not be loaded. It may have been removed, or the link may be invalid."
      />
    )
  }

  const auction = auctionQuery.data
  const sellerId = auction.seller?._id ?? auction.seller?.id ?? auction.seller
  const userId = user?.id ?? user?._id

  if (String(sellerId) !== String(userId)) {
    return (
      <StateMessage
        title="You cannot edit this auction"
        message="Only the seller who created this auction can manage it."
        auctionId={auctionId}
      />
    )
  }

  if (!canManage) {
    return (
      <StateMessage
        title="This auction is read-only"
        message="Only upcoming auctions that have not started and have no bids can be edited or deleted."
        auctionId={auctionId}
      />
    )
  }

  async function handleUpdate(updatedAuction) {
    await mutation.mutateAsync({ auctionId, auction: updatedAuction })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['auction', auctionId] }),
      queryClient.invalidateQueries({ queryKey: ['auctions'] }),
      queryClient.invalidateQueries({ queryKey: ['my-auctions'] }),
    ])
    toast.success('Auction updated successfully')
    navigate(`/auctions/${auctionId}`)
  }

  const initialValues = {
    title: auction.title ?? '',
    description: auction.description ?? '',
    category: auction.category ?? '',
    image: auction.image ?? '',
    startBid: auction.startBid == null ? '' : String(auction.startBid),
    minimumIncrement:
      auction.minimumIncrement == null ? '' : String(auction.minimumIncrement),
    startAt: toDateTimeLocal(auction.startAt),
    endAt: toDateTimeLocal(auction.endAt),
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
          <p className="text-sm font-semibold text-emerald-800">Seller tools</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Edit auction</h1>
          <p className="mt-2 text-stone-600">
            Update this upcoming auction before bidding begins. Ownership and live state remain server-controlled.
          </p>
        </header>

        <AuctionForm
          initialValues={initialValues}
          onSubmit={handleUpdate}
          submitLabel="Save changes"
          submittingLabel="Saving changes…"
          cancelTo={`/auctions/${auctionId}`}
        />
      </main>
    </div>
  )
}
