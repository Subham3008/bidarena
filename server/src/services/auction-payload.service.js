import Auction from '../models/auction.model.js'
import Timeline from '../models/timeline.model.js'

function toId(value) {
  const identifier =
    value?._id ?? (typeof value?.id === 'string' ? value.id : value)
  return identifier ? identifier.toString() : null
}

export function serializeParticipant(user) {
  if (!user) {
    return null
  }

  return {
    id: toId(user),
    name: user.displayName ?? null,
    avatarUrl: user.avatar || null,
  }
}

export function serializeAuctionState(auction) {
  return {
    id: toId(auction),
    seller: toId(auction.seller),
    title: auction.title,
    description: auction.description,
    image: auction.image,
    startBid: auction.startBid,
    minimumIncrement: auction.minimumIncrement,
    currentBid: auction.currentBid,
    currentBidder: serializeParticipant(auction.currentBidder),
    startAt: auction.startAt,
    endAt: auction.endAt,
    status: auction.status,
    winner: serializeParticipant(auction.winner),
    winningAmount: auction.winningAmount ?? null,
    bidCount: auction.bidCount,
    sequence: auction.sequence,
    version: auction.version,
    paymentStatus: auction.paymentStatus,
    createdAt: auction.createdAt,
    updatedAt: auction.updatedAt,
  }
}

export function serializeBidState(bid) {
  return {
    id: toId(bid),
    auctionId: toId(bid.auction),
    bidder: serializeParticipant(bid.bidder),
    amount: bid.amount,
    clientBidId: bid.clientBidId,
    sequence: bid.serverSequence,
    serverSequence: bid.serverSequence,
    createdAt: bid.timestamp,
    timestamp: bid.timestamp,
  }
}

export function serializeTimelineState(event) {
  const actor = serializeParticipant(event.actor)
  const timelineEvent = {
    id: toId(event),
    type: event.eventType,
    eventType: event.eventType,
    actor,
    sequence: event.sequence,
    metadata: event.metadata,
    createdAt: event.timestamp,
    timestamp: event.timestamp,
  }

  if (event.eventType === 'WINNER_DECLARED') {
    timelineEvent.winner = actor
  }

  return timelineEvent
}

export async function loadCompletedAuctionState(auctionId) {
  const auction = await Auction.findById(auctionId)
    .populate([
      { path: 'currentBidder', select: '_id displayName avatar' },
      { path: 'winner', select: '_id displayName avatar' },
    ])
    .lean()

  if (!auction || auction.status !== 'COMPLETED') {
    return null
  }

  const timelineEvent = await Timeline.findOne({
    auction: auctionId,
    eventType: auction.winner ? 'WINNER_DECLARED' : 'AUCTION_COMPLETED',
  })
    .sort({ sequence: -1 })
    .populate('actor', '_id displayName avatar')
    .lean()

  return {
    auction: serializeAuctionState(auction),
    timelineEvent: timelineEvent
      ? serializeTimelineState(timelineEvent)
      : null,
  }
}
