import { createServer } from 'node:http'

import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { io as createClient } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import Auction from '../models/auction.model.js'
import Bid from '../models/bid.model.js'
import Timeline from '../models/timeline.model.js'
import { User } from '../models/user.model.js'
import { createAuctionSocketServer } from '../sockets/auction-rooms.js'
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
} from '../utils/session.js'

describe('Socket.io auction rooms', () => {
  let mongoServer
  let httpServer
  let io
  let serverUrl
  let clients = []

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough'
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())

    httpServer = createServer()
    io = createAuctionSocketServer(httpServer)
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const address = httpServer.address()
    serverUrl = `http://127.0.0.1:${address.port}`
  }, 120000)

  afterEach(async () => {
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
    await new Promise((resolve) => io.close(resolve))
    await mongoose.disconnect()
    await mongoServer.stop()
  })

  function createAuction(overrides = {}) {
    return Auction.create({
      seller: new mongoose.Types.ObjectId(),
      title: 'Mechanical Keyboard',
      description: 'Socket room test auction',
      image: 'keyboard.jpg',
      startBid: 1000,
      minimumIncrement: 100,
      startAt: new Date('2026-08-01T11:00:00.000Z'),
      endAt: new Date('2026-08-01T13:00:00.000Z'),
      status: 'ACTIVE',
      ...overrides,
    })
  }

  async function connectClient(options = {}) {
    const client = createClient(serverUrl, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      ...options,
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

  it('sends an authoritative snapshot to a spectator', async () => {
    const auction = await createAuction({ currentBid: 3100 })
    const bidder = new mongoose.Types.ObjectId()

    await Bid.insertMany(
      Array.from({ length: 21 }, (_, index) => ({
        auction: auction.id,
        bidder,
        amount: 1100 + index * 100,
        clientBidId: `snapshot-bid-${index + 1}`,
        serverSequence: index + 1,
      })),
    )
    await Timeline.insertMany(
      Array.from({ length: 51 }, (_, index) => ({
        auction: auction.id,
        eventType: 'SNAPSHOT_EVENT',
        sequence: index + 1,
      })),
    )

    const client = await connectClient()
    const snapshotPromise = new Promise((resolve) => {
      client.once('auction_snapshot', resolve)
    })
    const acknowledgement = await emitWithAck(client, 'join_auction', {
      auctionId: auction.id,
      mode: 'SPECTATOR',
    })
    const snapshot = await snapshotPromise

    expect(acknowledgement).toEqual({ success: true, data: {} })
    expect(snapshot.auction).toMatchObject({
      id: auction.id,
      currentBid: 3100,
      status: 'ACTIVE',
    })
    expect(snapshot.latestBids).toHaveLength(20)
    expect(snapshot.timeline).toHaveLength(50)
    expect(snapshot.serverTime).toEqual(expect.any(Number))
    expect(snapshot.activeBidderCount).toBe(0)
    expect(snapshot.spectatorCount).toBe(1)
    expect(snapshot.currentUserRole).toBe('SPECTATOR')
  })

  it('rejects an unauthenticated BIDDER join', async () => {
    const auction = await createAuction()
    const client = await connectClient()

    const acknowledgement = await emitWithAck(client, 'join_auction', {
      auctionId: auction.id,
      mode: 'BIDDER',
    })

    expect(acknowledgement).toEqual({
      success: false,
      message: 'Authentication required for BIDDER mode',
    })
  })

  it('isolates events between two auction rooms', async () => {
    const seller = await User.create({
      displayName: 'Verified Seller',
      email: 'seller@example.com',
      passwordHash: 'stored-password-hash',
    })
    const [auctionA, auctionB] = await Promise.all([
      createAuction({ seller: seller.id, title: 'Auction A' }),
      createAuction({ title: 'Auction B' }),
    ])
    const token = createSessionToken(seller.id)
    const clientA = await connectClient({
      extraHeaders: {
        Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      },
    })
    const clientB = await connectClient()
    const snapshotAPromise = new Promise((resolve) => {
      clientA.once('auction_snapshot', resolve)
    })
    const snapshotBPromise = new Promise((resolve) => {
      clientB.once('auction_snapshot', resolve)
    })

    await emitWithAck(clientA, 'join_auction', {
      auctionId: auctionA.id,
      mode: 'BIDDER',
    })
    await emitWithAck(clientB, 'join_auction', {
      auctionId: auctionB.id,
      mode: 'SPECTATOR',
    })
    const [snapshotA, snapshotB] = await Promise.all([
      snapshotAPromise,
      snapshotBPromise,
    ])
    let clientBReceivedAuctionAEvent = false
    clientB.on('presence_updated', (event) => {
      clientBReceivedAuctionAEvent ||= event.auctionId === auctionA.id
    })
    const roomEventPromise = new Promise((resolve) => {
      clientA.once('presence_updated', resolve)
    })

    io.to(`auction:${auctionA.id}`).emit('presence_updated', {
      auctionId: auctionA.id,
      activeBidderCount: 0,
      spectatorCount: 0,
      serverTime: Date.now(),
    })
    await roomEventPromise
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(snapshotA.currentUserRole).toBe('SELLER')
    expect(snapshotB.currentUserRole).toBe('SPECTATOR')
    expect(clientBReceivedAuctionAEvent).toBe(false)
  })
})
