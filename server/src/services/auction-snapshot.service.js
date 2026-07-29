import Auction from '../models/auction.model.js'
import Bid from '../models/bid.model.js'
import Timeline from '../models/timeline.model.js'

function toId(value) {
  return value ? value.toString() : null
}

function serializeAuction(auction) {
  return {
    id: toId(auction._id),
    seller: toId(auction.seller),
    title: auction.title,
    description: auction.description,
    image: auction.image,
    startBid: auction.startBid,
    minimumIncrement: auction.minimumIncrement,
    currentBid: auction.currentBid,
    currentBidder: toId(auction.currentBidder),
    startAt: auction.startAt,
    endAt: auction.endAt,
    status: auction.status,
    winner: toId(auction.winner),
    bidCount: auction.bidCount,
    sequence: auction.sequence,
    paymentStatus: auction.paymentStatus,
    createdAt: auction.createdAt,
    updatedAt: auction.updatedAt,
  }
}

function serializeBid(bid) {
  return {
    id: toId(bid._id),
    bidder: toId(bid.bidder),
    amount: bid.amount,
    clientBidId: bid.clientBidId,
    serverSequence: bid.serverSequence,
    timestamp: bid.timestamp,
  }
}

function serializeTimelineEvent(event) {
  return {
    id: toId(event._id),
    eventType: event.eventType,
    actor: toId(event.actor),
    sequence: event.sequence,
    metadata: event.metadata,
    timestamp: event.timestamp,
  }
}

export async function loadAuctionSnapshotData(auctionId) {
  const auction = await Auction.findById(auctionId).lean()

  if (!auction) {
    return null
  }

  const [latestBids, timeline] = await Promise.all([
    Bid.find({ auction: auctionId })
      .sort({ serverSequence: -1 })
      .limit(20)
      .lean(),
    Timeline.find({ auction: auctionId })
      .sort({ sequence: -1 })
      .limit(50)
      .lean(),
  ])

  return {
    auction: serializeAuction(auction),
    latestBids: latestBids.reverse().map(serializeBid),
    timeline: timeline.reverse().map(serializeTimelineEvent),
  }
}
