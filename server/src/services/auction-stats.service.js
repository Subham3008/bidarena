import mongoose from 'mongoose'

import Auction from '../models/auction.model.js'
import Bid from '../models/bid.model.js'

const HEAT_WINDOW_SECONDS = 60
const HEAT_WINDOW_MS = HEAT_WINDOW_SECONDS * 1_000

function calculateHeat(recentBidCount) {
  if (recentBidCount >= 5) {
    return 'HOT'
  }

  if (recentBidCount >= 2) {
    return 'WARM'
  }

  return 'COLD'
}

export async function loadAuctionRealtimeState(
  auctionId,
  presence,
  now = new Date(),
) {
  if (!mongoose.isObjectIdOrHexString(auctionId)) {
    return null
  }

  const normalizedAuctionId = new mongoose.Types.ObjectId(auctionId)
  const windowStart = new Date(now.getTime() - HEAT_WINDOW_MS)
  const [auction, activityRows] = await Promise.all([
    Auction.findById(normalizedAuctionId)
      .select('bidCount currentBid status')
      .lean(),
    Bid.aggregate([
      { $match: { auction: normalizedAuctionId } },
      {
        $group: {
          _id: null,
          uniqueBidders: { $addToSet: '$bidder' },
          lastBidAt: { $max: '$timestamp' },
          recentBidCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$timestamp', windowStart] },
                    { $lte: ['$timestamp', now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          uniqueBidderCount: { $size: '$uniqueBidders' },
          lastBidAt: 1,
          recentBidCount: 1,
        },
      },
    ]),
  ])

  if (!auction) {
    return null
  }

  const activity = activityRows[0] ?? {
    uniqueBidderCount: 0,
    lastBidAt: null,
    recentBidCount: 0,
  }

  // Statistics combine persisted auction/bid state with the room's unique presence counts.
  const stats = {
    bidderCount: presence.activeBidderCount,
    spectatorCount: presence.spectatorCount,
    bidCount: auction.bidCount,
    uniqueBidderCount: activity.uniqueBidderCount,
    currentBid: auction.currentBid,
    bidVelocityPerMinute: activity.recentBidCount,
    lastBidAt: activity.lastBidAt?.toISOString() ?? null,
    status: auction.status,
  }

  return {
    stats,
    // Heat uses only persisted accepted bids inside the latest 60-second window.
    heat: {
      heat: calculateHeat(activity.recentBidCount),
      recentBidCount: activity.recentBidCount,
      windowSeconds: HEAT_WINDOW_SECONDS,
    },
  }
}
