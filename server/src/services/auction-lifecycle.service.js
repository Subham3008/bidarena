import mongoose from 'mongoose'

import Auction from '../models/auction.model.js'
import Timeline from '../models/timeline.model.js'

async function runInTransaction(operation) {
  const session = await mongoose.startSession()
  let result = null

  try {
    await session.withTransaction(async () => {
      result = await operation(session)
    })
  } finally {
    await session.endSession()
  }

  return result
}

export async function activateAuction(auctionId, now = new Date()) {
  return runInTransaction(async (session) => {
    // Server time and the persisted window exclusively own lifecycle activation.
    const auction = await Auction.findOneAndUpdate(
      {
        _id: auctionId,
        status: 'UPCOMING',
        startAt: { $lte: now },
        endAt: { $gt: now },
      },
      {
        $set: { status: 'ACTIVE' },
        $inc: { timelineSequence: 1 },
      },
      { returnDocument: 'after', session },
    )

    if (!auction) {
      return null
    }

    await Timeline.create(
      [
        {
          auction: auction.id,
          eventType: 'AUCTION_STARTED',
          sequence: auction.timelineSequence,
          timestamp: now,
        },
      ],
      { session },
    )

    return auction
  })
}

export async function completeAuction(auctionId, now = new Date()) {
  return runInTransaction(async (session) => {
    // The ACTIVE filter is the atomic guard against duplicate completion and winners.
    const auction = await Auction.findOneAndUpdate(
      {
        _id: auctionId,
        status: 'ACTIVE',
        endAt: { $lte: now },
      },
      [
        {
          $set: {
            status: 'COMPLETED',
            winner: { $ifNull: ['$currentBidder', null] },
            timelineSequence: {
              $add: [
                { $ifNull: ['$timelineSequence', 0] },
                {
                  $cond: [
                    {
                      $ne: [{ $ifNull: ['$currentBidder', null] }, null],
                    },
                    2,
                    1,
                  ],
                },
              ],
            },
          },
        },
      ],
      { returnDocument: 'after', session, updatePipeline: true },
    )

    if (!auction) {
      return null
    }

    const hasWinner = Boolean(auction.winner)
    const completedSequence = auction.timelineSequence - (hasWinner ? 1 : 0)
    const timelineEvents = [
      {
        auction: auction.id,
        eventType: 'AUCTION_COMPLETED',
        sequence: completedSequence,
        metadata: { finalBid: auction.currentBid },
        timestamp: now,
      },
    ]

    if (hasWinner) {
      timelineEvents.push({
        auction: auction.id,
        eventType: 'WINNER_DECLARED',
        actor: auction.winner,
        sequence: auction.timelineSequence,
        metadata: { winningBid: auction.currentBid },
        timestamp: now,
      })
    }

    await Timeline.create(timelineEvents, { ordered: true, session })

    return auction
  })
}

export async function recoverAuctionLifecycle(now = new Date()) {
  const auctions = await Auction.find({
    status: { $in: ['UPCOMING', 'ACTIVE'] },
  })
    .select('_id status startAt endAt')
    .lean()

  let activated = 0
  let completed = 0

  // Status-guarded transitions make repeated startup recovery safe and idempotent.
  for (const auction of auctions) {
    if (
      auction.status === 'UPCOMING' &&
      auction.startAt <= now &&
      auction.endAt > now
    ) {
      const result = await activateAuction(auction._id, now)
      activated += result ? 1 : 0
    } else if (auction.status === 'ACTIVE' && auction.endAt <= now) {
      const result = await completeAuction(auction._id, now)
      completed += result ? 1 : 0
    }
  }

  return { activated, completed }
}
