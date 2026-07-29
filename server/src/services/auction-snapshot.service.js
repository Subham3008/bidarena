import Auction from '../models/auction.model.js'
import Bid from '../models/bid.model.js'
import Timeline from '../models/timeline.model.js'
import {
  serializeAuctionState,
  serializeBidState,
  serializeTimelineState,
} from './auction-payload.service.js'

export async function loadAuctionSnapshotData(auctionId) {
  const auction = await Auction.findById(auctionId)
    .populate([
      { path: 'currentBidder', select: '_id displayName avatar' },
      { path: 'winner', select: '_id displayName avatar' },
    ])
    .lean()

  if (!auction) {
    return null
  }

  const [latestBids, timeline] = await Promise.all([
    Bid.find({ auction: auctionId })
      .sort({ serverSequence: -1 })
      .limit(20)
      .populate('bidder', '_id displayName avatar')
      .lean(),
    Timeline.find({ auction: auctionId })
      .sort({ sequence: -1 })
      .limit(50)
      .populate('actor', '_id displayName avatar')
      .lean(),
  ])

  return {
    auction: serializeAuctionState(auction),
    latestBids: latestBids.reverse().map(serializeBidState),
    timeline: timeline.reverse().map(serializeTimelineState),
  }
}
