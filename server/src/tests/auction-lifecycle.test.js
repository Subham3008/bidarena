import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import Auction from '../models/auction.model.js'
import Timeline from '../models/timeline.model.js'
import {
  completeAuction,
  recoverAuctionLifecycle,
} from '../services/auction-lifecycle.service.js'

describe('auction lifecycle recovery', () => {
  let mongoServer

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    await mongoose.connect(mongoServer.getUri())
    await Promise.all([Auction.init(), Timeline.init()])
  }, 120000)

  afterEach(async () => {
    await Promise.all([Auction.deleteMany({}), Timeline.deleteMany({})])
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })

  function auctionData(overrides = {}) {
    const now = new Date('2026-08-01T12:00:00.000Z')

    return {
      seller: new mongoose.Types.ObjectId(),
      title: 'Mechanical Keyboard',
      description: 'A tested auction item',
      image: 'keyboard.jpg',
      startBid: 1000,
      minimumIncrement: 100,
      startAt: new Date(now.getTime() - 60_000),
      endAt: new Date(now.getTime() + 60_000),
      ...overrides,
    }
  }

  it('activates a due upcoming auction', async () => {
    const now = new Date('2026-08-01T12:00:00.000Z')
    const auction = await Auction.create(auctionData())

    await recoverAuctionLifecycle(now)

    const recoveredAuction = await Auction.findById(auction.id)
    const timeline = await Timeline.find({ auction: auction.id })

    expect(recoveredAuction.status).toBe('ACTIVE')
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({
      eventType: 'AUCTION_STARTED',
      sequence: 1,
    })
  })

  it('completes an expired active auction', async () => {
    const now = new Date('2026-08-01T12:00:00.000Z')
    const auction = await Auction.create(
      auctionData({
        status: 'ACTIVE',
        endAt: new Date(now.getTime() - 1),
        currentBid: 1400,
      }),
    )

    await recoverAuctionLifecycle(now)

    const recoveredAuction = await Auction.findById(auction.id)
    const timeline = await Timeline.find({ auction: auction.id })

    expect(recoveredAuction.status).toBe('COMPLETED')
    expect(recoveredAuction.winner).toBeNull()
    expect(recoveredAuction.currentBid).toBe(1400)
    expect(timeline).toHaveLength(1)
    expect(timeline[0].eventType).toBe('AUCTION_COMPLETED')
  })

  it('does not declare a winner twice when completion is called twice', async () => {
    const now = new Date('2026-08-01T12:00:00.000Z')
    const winner = new mongoose.Types.ObjectId()
    const auction = await Auction.create(
      auctionData({
        status: 'ACTIVE',
        endAt: new Date(now.getTime() - 1),
        currentBid: 1800,
        currentBidder: winner,
      }),
    )

    const firstResult = await completeAuction(auction.id, now)
    const secondResult = await completeAuction(auction.id, now)
    const recoveredAuction = await Auction.findById(auction.id)
    const timeline = await Timeline.find({ auction: auction.id }).sort({
      sequence: 1,
    })

    expect(firstResult.status).toBe('COMPLETED')
    expect(secondResult).toBeNull()
    expect(recoveredAuction.winner).toEqual(winner)
    expect(timeline.map((event) => event.eventType)).toEqual([
      'AUCTION_COMPLETED',
      'WINNER_DECLARED',
    ])
    expect(timeline.map((event) => event.sequence)).toEqual([1, 2])
  })
})
