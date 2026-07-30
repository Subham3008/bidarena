import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import app from '../app.js'
import Auction from '../models/auction.model.js'
import Bid from '../models/bid.model.js'
import { User } from '../models/user.model.js'
import { createAuctionTimerManager } from '../services/auction-timer-manager.js'

describe('seller auction management API', () => {
  let mongoServer
  let timerManager
  let emittedEvents
  let accountSequence = 0

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough'
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())
    emittedEvents = []
    timerManager = createAuctionTimerManager({
      to: () => ({
        emit: (event, payload) => emittedEvents.push({ event, payload }),
      }),
    })
  }, 120000)

  afterEach(async () => {
    timerManager.clearAll()
    await timerManager.waitForIdle()
    vi.restoreAllMocks()
    emittedEvents.length = 0
    await Promise.all([
      Auction.deleteMany({}),
      Bid.deleteMany({}),
      User.deleteMany({}),
    ])
  })

  afterAll(async () => {
    await timerManager?.shutdown()
    await mongoose.disconnect()
    await mongoServer?.stop()
  })

  async function createSeller(displayName) {
    accountSequence += 1
    const agent = request.agent(app)
    const registration = await agent.post('/api/auth/register').send({
      displayName,
      email: `seller-${accountSequence}@example.com`,
      password: 'password123',
    })

    return { agent, id: registration.body.data.user.id }
  }

  function auctionData(sellerId, overrides = {}) {
    return {
      seller: sellerId,
      title: 'Vintage Camera',
      description: 'A carefully maintained film camera.',
      category: 'Collectibles',
      image: 'https://example.com/camera.jpg',
      startBid: 5000,
      minimumIncrement: 250,
      startAt: new Date(Date.now() + 60_000),
      endAt: new Date(Date.now() + 3_600_000),
      status: 'UPCOMING',
      ...overrides,
    }
  }

  it('allows the owner to update an upcoming auction', async () => {
    const seller = await createSeller('Owner')
    const auction = await Auction.create(
      auctionData(seller.id, {
        startAt: new Date(Date.now() + 3_000),
        endAt: new Date(Date.now() + 15_000),
      }),
    )
    timerManager.scheduleAuction(auction)
    const nextStartAt = new Date(Date.now() + 10_000)
    const nextEndAt = new Date(Date.now() + 20_000)

    const response = await seller.agent
      .patch(`/api/auctions/${auction.id}`)
      .send({
        title: 'Restored Vintage Camera',
        category: 'Photography',
        startBid: 6500,
        startAt: nextStartAt.toISOString(),
        endAt: nextEndAt.toISOString(),
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      message: 'Auction updated successfully',
      data: {
        auction: {
          _id: auction.id,
          title: 'Restored Vintage Camera',
          category: 'Photography',
          startBid: 6500,
          currentBid: 6500,
          status: 'UPCOMING',
        },
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 3_150))
    const storedAuction = await Auction.findById(auction.id)
    expect(storedAuction.seller.toString()).toBe(seller.id)
    expect(storedAuction.currentBid).toBe(6500)
    expect(storedAuction.status).toBe('UPCOMING')
    expect(
      emittedEvents.some(
        ({ event, payload }) =>
          event === 'auction_started' && payload.auctionId === auction.id,
      ),
    ).toBe(false)
  }, 15_000)

  it('forbids a non-owner from updating or deleting an auction', async () => {
    const owner = await createSeller('Owner')
    const otherSeller = await createSeller('Other seller')
    const auction = await Auction.create(auctionData(owner.id))

    const updateResponse = await otherSeller.agent
      .patch(`/api/auctions/${auction.id}`)
      .send({ title: 'Taken over' })
    const deleteResponse = await otherSeller.agent.delete(
      `/api/auctions/${auction.id}`,
    )

    expect(updateResponse.status).toBe(403)
    expect(deleteResponse.status).toBe(403)
    expect(updateResponse.body.error.code).toBe('AUCTION_FORBIDDEN')
    expect(deleteResponse.body.error.code).toBe('AUCTION_FORBIDDEN')
    expect(await Auction.exists({ _id: auction.id })).toBeTruthy()
  })

  it('rejects update and deletion for active and completed auctions', async () => {
    const seller = await createSeller('Lifecycle owner')
    const now = Date.now()
    const auctions = await Auction.create([
      auctionData(seller.id, {
        title: 'Active auction',
        status: 'ACTIVE',
        startAt: new Date(now - 60_000),
      }),
      auctionData(seller.id, {
        title: 'Completed auction',
        status: 'COMPLETED',
        startAt: new Date(now - 120_000),
        endAt: new Date(now - 60_000),
      }),
    ])

    for (const auction of auctions) {
      const updateResponse = await seller.agent
        .patch(`/api/auctions/${auction.id}`)
        .send({ title: 'Disallowed update' })
      const deleteResponse = await seller.agent.delete(
        `/api/auctions/${auction.id}`,
      )

      expect(updateResponse.status).toBe(409)
      expect(deleteResponse.status).toBe(409)
      expect(updateResponse.body.error.code).toBe('AUCTION_NOT_EDITABLE')
      expect(deleteResponse.body.error.code).toBe('AUCTION_NOT_DELETABLE')
    }
  })

  it('rejects attempts to update authoritative auction fields', async () => {
    const seller = await createSeller('Safe fields owner')
    const auction = await Auction.create(auctionData(seller.id))

    const response = await seller.agent
      .patch(`/api/auctions/${auction.id}`)
      .send({
        status: 'COMPLETED',
        currentBid: 1,
        winner: new mongoose.Types.ObjectId().toString(),
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')

    const insecureImageResponse = await seller.agent
      .patch(`/api/auctions/${auction.id}`)
      .send({ image: 'javascript:alert(1)' })

    expect(insecureImageResponse.status).toBe(400)
    expect(insecureImageResponse.body.error.code).toBe('VALIDATION_ERROR')
    const storedAuction = await Auction.findById(auction.id)
    expect(storedAuction).toMatchObject({
      status: 'UPCOMING',
      currentBid: 5000,
      winner: null,
    })
  })

  it('rejects management when bid counters or accepted bid records exist', async () => {
    const seller = await createSeller('Bid-protected owner')
    const bidder = await createSeller('Accepted bidder')
    const countedAuction = await Auction.create(
      auctionData(seller.id, { bidCount: 1 }),
    )
    const persistedBidAuction = await Auction.create(
      auctionData(seller.id, { title: 'Persisted bid auction' }),
    )
    await Bid.create({
      auction: persistedBidAuction.id,
      bidder: bidder.id,
      amount: 5250,
      clientBidId: 'accepted-bid-1',
      serverSequence: 1,
    })

    for (const auction of [countedAuction, persistedBidAuction]) {
      const updateResponse = await seller.agent
        .patch(`/api/auctions/${auction.id}`)
        .send({ title: 'Disallowed after a bid' })
      const deleteResponse = await seller.agent.delete(
        `/api/auctions/${auction.id}`,
      )

      expect(updateResponse.status).toBe(409)
      expect(deleteResponse.status).toBe(409)
      expect(updateResponse.body.error.code).toBe('AUCTION_NOT_EDITABLE')
      expect(deleteResponse.body.error.code).toBe('AUCTION_NOT_DELETABLE')
      expect(await Auction.exists({ _id: auction.id })).toBeTruthy()
    }
  })

  it('validates partial schedule updates against the stored schedule', async () => {
    const seller = await createSeller('Schedule owner')
    const startAt = new Date(Date.now() + 60_000)
    const endAt = new Date(Date.now() + 3_600_000)
    const auction = await Auction.create(
      auctionData(seller.id, { startAt, endAt }),
    )

    const earlyEndResponse = await seller.agent
      .patch(`/api/auctions/${auction.id}`)
      .send({ endAt: new Date(startAt.getTime() - 1_000).toISOString() })
    const lateStartResponse = await seller.agent
      .patch(`/api/auctions/${auction.id}`)
      .send({ startAt: new Date(endAt.getTime() + 1_000).toISOString() })

    expect(earlyEndResponse.status).toBe(400)
    expect(lateStartResponse.status).toBe(400)
    expect(earlyEndResponse.body.error.code).toBe('VALIDATION_ERROR')
    expect(lateStartResponse.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('reschedules once only when auction timing changes', async () => {
    const seller = await createSeller('Timer owner')
    const auction = await Auction.create(auctionData(seller.id))
    const scheduleSpy = vi.spyOn(timerManager, 'scheduleAuction')

    const titleResponse = await seller.agent
      .patch(`/api/auctions/${auction.id}`)
      .send({ title: 'Updated without a timer reset' })

    expect(titleResponse.status).toBe(200)
    expect(scheduleSpy).not.toHaveBeenCalled()

    const timingResponse = await seller.agent
      .patch(`/api/auctions/${auction.id}`)
      .send({
        startAt: new Date(Date.now() + 120_000).toISOString(),
        endAt: new Date(Date.now() + 240_000).toISOString(),
      })

    expect(timingResponse.status).toBe(200)
    expect(scheduleSpy).toHaveBeenCalledTimes(1)
    expect(scheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: auction.id }),
    )
  })

  it('deletes an eligible auction without stale lifecycle activation', async () => {
    const seller = await createSeller('Deleting owner')
    const auction = await Auction.create(
      auctionData(seller.id, {
        startAt: new Date(Date.now() + 3_000),
        endAt: new Date(Date.now() + 15_000),
      }),
    )
    timerManager.scheduleAuction(auction)

    const response = await seller.agent.delete(`/api/auctions/${auction.id}`)
    await new Promise((resolve) => setTimeout(resolve, 3_150))

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      message: 'Auction deleted successfully',
      data: { auctionId: auction.id },
    })
    expect(await Auction.findById(auction.id)).toBeNull()
    expect(
      emittedEvents.some(
        ({ event, payload }) =>
          event === 'auction_started' && payload.auctionId === auction.id,
      ),
    ).toBe(false)
  }, 15_000)
})
