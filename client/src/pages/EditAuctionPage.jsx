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

function StateMessage({ title, message, auctionId, onRetry }) {
  return (
    <div className="app-shell">
      <MarketplaceHeader />
      <main className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-stone-200 text-stone-700">
          <LockKeyhole size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto mt-3 max-w-lg leading-7 text-stone-600">
          {message}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {onRetry ? (
            <button type="button" onClick={onRetry} className="btn-primary">
              Try again
            </button>
          ) : null}
          <Link
            to="/dashboard"
            className="btn-secondary"
          >
            Back to dashboard
          </Link>
          {auctionId ? (
            <Link
              to={`/auctions/${auctionId}`}
              className="btn-primary"
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
      <div className="app-shell">
        <MarketplaceHeader />
        <main
          className="mx-auto max-w-5xl animate-pulse px-4 py-10 sm:px-6"
          aria-label="Loading auction editor"
          role="status"
        >
          <div className="h-4 w-36 bg-stone-200" />
          <div className="mt-7 h-10 w-72 max-w-full bg-stone-200" />
          <div className="mt-8 h-80 border border-stone-200 bg-white" />
        </main>
      </div>
    )
  }

  if (auctionQuery.isError) {
    const status = auctionQuery.error.response?.status
    const unavailable = status === 400 || status === 404

    return (
      <StateMessage
        title={unavailable ? 'Auction unavailable' : 'Unable to load auction'}
        message={
          unavailable
            ? 'This auction may have been removed, or the link may be invalid.'
            : 'Check your connection and retry before returning to the dashboard.'
        }
        onRetry={unavailable ? undefined : () => auctionQuery.refetch()}
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
          <p className="page-kicker">Seller tools</p>
          <h1 className="page-title mt-2">Edit auction</h1>
          <p className="page-description mt-3">
            Update “{auction.title}” before bidding begins. Ownership and live
            state remain server-controlled.
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
