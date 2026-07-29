import { createServer } from 'node:http'

import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { io as createClient } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import Auction from '../models/auction.model.js'
import Bid from '../models/bid.model.js'
import Timeline from '../models/timeline.model.js'
import { User } from '../models/user.model.js'
import { completeAuction } from '../services/auction-lifecycle.service.js'
import { createAuctionTimerManager } from '../services/auction-timer-manager.js'
import { createAuctionSocketServer } from '../sockets/auction-rooms.js'

describe('authoritative auction lifecycle timers', () => {
  let mongoServer
  let httpServer
  let io
  let timerManager
  let serverUrl
  let clients = []

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    await mongoose.connect(mongoServer.getUri())
    await Promise.all([Auction.init(), Bid.init(), Timeline.init(), User.init()])

    httpServer = createServer()
    io = createAuctionSocketServer(httpServer)
    timerManager = createAuctionTimerManager(io, { syncIntervalMs: 20 })
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const address = httpServer.address()
    serverUrl = `http://127.0.0.1:${address.port}`
  }, 120000)

  afterEach(async () => {
    timerManager.clearAll()
    await timerManager.waitForIdle()
    timerManager.clearAll()

    for (const client of clients) {
      client.disconnect()
    }

    clients = []
    await Promise.all([
      Auction.deleteMany({}),
      Bid.deleteMany({}),
      Timeline.deleteMany({}),
      User.deleteMany({}),
    ])
  })

  afterAll(async () => {
    await timerManager?.shutdown()

    if (io) {
      await new Promise((resolve) => io.close(resolve))
    }

    await mongoose.disconnect()
    await mongoServer?.stop()
  })

  function auctionData(overrides = {}) {
    const now = Date.now()

    return {
      seller: new mongoose.Types.ObjectId(),
      title: 'Mechanical Keyboard',
      description: 'A tested auction item',
      image: 'keyboard.jpg',
      startBid: 1000,
      minimumIncrement: 100,
      startAt: new Date(now + 75),
      endAt: new Date(now + 5_000),
      ...overrides,
    }
  }

  async function waitForAuctionStatus(auctionId, status) {
    const deadline = Date.now() + 3_000

    while (Date.now() < deadline) {
      const auction = await Auction.findById(auctionId)

      if (auction?.status === status) {
        return auction
      }

      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    throw new Error(`Auction did not become ${status}`)
  }

  async function connectSpectator() {
    const client = createClient(serverUrl, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    })
    clients.push(client)

    await new Promise((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
    })

    return client
  }

  function emitWithAck(client, event, payload) {
    return new Promise((resolve) => client.emit(event, payload, resolve))
  }

  it('automatically activates an upcoming auction', async () => {
    const auction = await Auction.create(auctionData())

    await timerManager.schedulePersistedAuctions()
    const activatedAuction = await waitForAuctionStatus(auction.id, 'ACTIVE')
    const timeline = await Timeline.find({ auction: auction.id })

    expect(activatedAuction.status).toBe('ACTIVE')
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({
      eventType: 'AUCTION_STARTED',
      sequence: 1,
    })
  })

  it('automatically completes an active auction', async () => {
    const auction = await Auction.create(
      auctionData({
        status: 'ACTIVE',
        startAt: new Date(Date.now() - 1_000),
        endAt: new Date(Date.now() + 75),
      }),
    )

    timerManager.scheduleAuction(auction)
    const completedAuction = await waitForAuctionStatus(auction.id, 'COMPLETED')

    expect(completedAuction.currentBid).toBe(1000)
    expect(
      await Timeline.countDocuments({
        auction: auction.id,
        eventType: 'AUCTION_COMPLETED',
      }),
    ).toBe(1)
  })

  it('finalises the persisted highest bidder as winner', async () => {
    const winner = new mongoose.Types.ObjectId()
    const auction = await Auction.create(
      auctionData({
        status: 'ACTIVE',
        startAt: new Date(Date.now() - 1_000),
        endAt: new Date(Date.now() + 75),
        currentBid: 1800,
        currentBidder: winner,
        bidCount: 1,
      }),
    )
    const client = await connectSpectator()
    await emitWithAck(client, 'join_auction', {
      auctionId: auction.id,
      mode: 'SPECTATOR',
    })
    const completionPromise = new Promise((resolve) => {
      client.once('auction_completed', resolve)
    })

    timerManager.scheduleAuction(auction)
    const [completedAuction, completion] = await Promise.all([
      waitForAuctionStatus(auction.id, 'COMPLETED'),
      completionPromise,
    ])

    expect(completedAuction.winner).toEqual(winner)
    expect(completedAuction.winningAmount).toBe(1800)
    expect(completedAuction.currentBid).toBe(1800)
    expect(completion).toMatchObject({
      auctionId: auction.id,
      status: 'COMPLETED',
      winner: { id: winner.toString() },
      winningAmount: 1800,
      bidCount: 1,
    })
  })

  it('completes without a winner when no bid exists', async () => {
    const auction = await Auction.create(
      auctionData({
        status: 'ACTIVE',
        startAt: new Date(Date.now() - 1_000),
        endAt: new Date(Date.now() + 75),
      }),
    )

    timerManager.scheduleAuction(auction)
    const completedAuction = await waitForAuctionStatus(auction.id, 'COMPLETED')

    expect(completedAuction.winner).toBeNull()
    expect(completedAuction.winningAmount).toBeNull()
  })

  it('does not duplicate finalisation when completion repeats', async () => {
    const winner = new mongoose.Types.ObjectId()
    const now = new Date()
    const auction = await Auction.create(
      auctionData({
        status: 'ACTIVE',
        startAt: new Date(now.getTime() - 1_000),
        endAt: new Date(now.getTime() - 1),
        currentBid: 1900,
        currentBidder: winner,
        bidCount: 1,
      }),
    )

    const firstResult = await completeAuction(auction.id, now)
    const secondResult = await completeAuction(auction.id, now)
    const completedEvents = await Timeline.find({ auction: auction.id }).sort({
      sequence: 1,
    })

    expect(firstResult.winningAmount).toBe(1900)
    expect(secondResult).toBeNull()
    expect(completedEvents.map((event) => event.eventType)).toEqual([
      'AUCTION_COMPLETED',
      'WINNER_DECLARED',
    ])
  })

  it('keeps timer events isolated to the correct auction room', async () => {
    const now = Date.now()
    const [auctionA, auctionB] = await Promise.all([
      Auction.create(
        auctionData({
          title: 'Auction A',
          startAt: new Date(now + 300),
          endAt: new Date(now + 10_000),
        }),
      ),
      Auction.create(
        auctionData({
          title: 'Auction B',
          startAt: new Date(now + 15_000),
          endAt: new Date(now + 20_000),
        }),
      ),
    ])
    const [clientA, clientB] = await Promise.all([
      connectSpectator(),
      connectSpectator(),
    ])

    await Promise.all([
      emitWithAck(clientA, 'join_auction', {
        auctionId: auctionA.id,
        mode: 'SPECTATOR',
      }),
      emitWithAck(clientB, 'join_auction', {
        auctionId: auctionB.id,
        mode: 'SPECTATOR',
      }),
    ])

    let crossedRooms = false
    clientB.on('auction_started', (event) => {
      crossedRooms ||= event.auctionId === auctionA.id
    })
    clientB.on('timer_sync', (event) => {
      crossedRooms ||= event.auctionId === auctionA.id
    })
    const startedPromise = new Promise((resolve) => {
      clientA.once('auction_started', resolve)
    })
    const syncPromise = new Promise((resolve) => {
      clientA.once('timer_sync', resolve)
    })

    timerManager.scheduleAuction(auctionA)
    timerManager.scheduleAuction(auctionB)
    const [started, sync] = await Promise.all([startedPromise, syncPromise])
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(started.auctionId).toBe(auctionA.id)
    expect(sync).toMatchObject({
      auctionId: auctionA.id,
      status: 'ACTIVE',
    })
    expect(sync.remainingMs).toBeGreaterThanOrEqual(0)
    expect(crossedRooms).toBe(false)
  })
})
