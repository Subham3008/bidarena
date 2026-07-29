import mongoose from 'mongoose'

import Auction from '../models/auction.model.js'
import Bid from '../models/bid.model.js'
import Timeline from '../models/timeline.model.js'

export class BidRejectedError extends Error {}

function reject(message) {
  throw new BidRejectedError(message)
}

function serializeBid(bid) {
  return {
    id: bid.id,
    auctionId: bid.auction.toString(),
    bidder: bid.bidder.toString(),
    amount: bid.amount,
    clientBidId: bid.clientBidId,
    serverSequence: bid.serverSequence,
    timestamp: bid.timestamp,
  }
}

function serializeAuction(auction) {
  return {
    id: auction.id,
    currentBid: auction.currentBid,
    currentBidder: auction.currentBidder.toString(),
    bidCount: auction.bidCount,
    sequence: auction.sequence,
    version: auction.version,
  }
}

export async function processBid({
  auctionId,
  bidderId,
  amount,
  clientBidId,
}) {
  if (!mongoose.isObjectIdOrHexString(auctionId)) {
    reject('Auction not found')
  }

  const normalizedClientBidId =
    typeof clientBidId === 'string' ? clientBidId.trim() : ''
  const session = await mongoose.startSession()
  let acceptedBid = null

  try {
    // Auction state, Bid, and Timeline commit together or roll back together.
    await session.withTransaction(async () => {
      const auction = await Auction.findById(auctionId).session(session)

      if (!auction) {
        reject('Auction not found')
      }

      if (auction.status === 'COMPLETED') {
        reject('Auction is completed')
      }

      if (auction.status !== 'ACTIVE') {
        reject('Auction is not active')
      }

      const now = new Date()

      if (now >= auction.endAt) {
        reject('Auction has ended')
      }

      if (auction.seller.toString() === bidderId) {
        reject('Seller cannot bid on own auction')
      }

      if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        reject('Bid amount must be a number')
      }

      if (amount <= 0) {
        reject('Bid amount must be greater than zero')
      }

      if (!normalizedClientBidId) {
        reject('clientBidId is required')
      }

      // The unique index is authoritative; this pre-check gives retries a clear rejection.
      const duplicateBid = await Bid.exists({
        auction: auction.id,
        clientBidId: normalizedClientBidId,
      }).session(session)

      if (duplicateBid) {
        reject('Duplicate bid request')
      }

      const minimumBid = auction.currentBid + auction.minimumIncrement

      if (amount < minimumBid) {
        reject(`Bid must be at least ${minimumBid}`)
      }

      auction.currentBid = amount
      auction.currentBidder = bidderId
      auction.bidCount = (auction.bidCount ?? 0) + 1
      auction.sequence = (auction.sequence ?? 0) + 1
      auction.timelineSequence = (auction.timelineSequence ?? 0) + 1
      auction.increment()
      await auction.save({ session })

      const [bid] = await Bid.create(
        [
          {
            auction: auction.id,
            bidder: bidderId,
            amount,
            clientBidId: normalizedClientBidId,
            serverSequence: auction.sequence,
            timestamp: now,
          },
        ],
        { session },
      )

      await Timeline.create(
        [
          {
            auction: auction.id,
            eventType: 'BID_ACCEPTED',
            actor: bidderId,
            sequence: auction.timelineSequence,
            metadata: {
              amount,
              bidSequence: auction.sequence,
            },
            timestamp: now,
          },
        ],
        { session },
      )

      acceptedBid = {
        bid: serializeBid(bid),
        auction: serializeAuction(auction),
      }
    })
  } catch (error) {
    if (
      error?.code === 11000 &&
      (Object.hasOwn(error.keyPattern ?? {}, 'clientBidId') ||
        Object.hasOwn(error.keyValue ?? {}, 'clientBidId'))
    ) {
      throw new BidRejectedError('Duplicate bid request')
    }

    throw error
  } finally {
    await session.endSession()
  }

  return acceptedBid
}
