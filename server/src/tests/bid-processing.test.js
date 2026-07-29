import { createServer } from 'node:http'

import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
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

describe('deterministic live bid processing', () => {
  let mongoServer
  let httpServer
  let io
  let serverUrl
  let clients = []
  let userNumber = 0

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough'
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    await mongoose.connect(mongoServer.getUri())
    await Promise.all([Auction.init(), Bid.init(), Timeline.init(), User.init()])

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

  async function createUser(displayName, overrides = {}) {
    userNumber += 1
    return User.create({
      displayName,
      email: `bid-user-${userNumber}@example.com`,
      passwordHash: 'stored-password-hash',
      ...overrides,
    })
  }

  function createAuction(seller, overrides = {}) {
    const now = Date.now()

    return Auction.create({
      seller: seller.id,
      title: 'Deterministic Auction',
      description: 'Bid processing test auction',
      image: 'auction.jpg',
      startBid: 1000,
      minimumIncrement: 100,
      startAt: new Date(now - 60_000),
      endAt: new Date(now + 60_000),
      status: 'ACTIVE',
      ...overrides,
    })
  }

  async function connectUser(user) {
    const token = createSessionToken(user.id)
    const client = createClient(serverUrl, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      extraHeaders: {
        Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      },
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

  async function joinBidder(client, auctionId) {
    return emitWithAck(client, 'join_auction', {
      auctionId,
      mode: 'BIDDER',
    })
  }

  it('broadcasts an accepted bid to every socket in the auction room', async () => {
    const seller = await createUser('Seller One')
    const bidder = await createUser('Bidder One')
    const observer = await createUser('Observer One')
    const auction = await createAuction(seller)
    const [client, observerClient] = await Promise.all([
      connectUser(bidder),
      connectUser(observer),
    ])
    await Promise.all([
      joinBidder(client, auction.id),
      joinBidder(observerClient, auction.id),
    ])
    const senderUpdatePromise = new Promise((resolve) => {
      client.once('auction_state_updated', resolve)
    })
    const observerUpdatePromise = new Promise((resolve) => {
      observerClient.once('auction_state_updated', resolve)
    })

    const acknowledgement = await emitWithAck(client, 'place_bid', {
      auctionId: auction.id,
      amount: 1100,
      clientBidId: 'valid-bid-1',
    })
    const [senderUpdate, observerUpdate] = await Promise.all([
      senderUpdatePromise,
      observerUpdatePromise,
    ])
    const [storedAuction, storedBid, timelineEvent] = await Promise.all([
      Auction.findById(auction.id),
      Bid.findOne({ auction: auction.id }),
      Timeline.findOne({ auction: auction.id, eventType: 'BID_ACCEPTED' }),
    ])

    expect(acknowledgement.success).toBe(true)
    expect(acknowledgement.data.bid).toMatchObject({
      amount: 1100,
      bidder: {
        id: bidder.id,
        name: 'Bidder One',
        avatarUrl: null,
      },
      serverSequence: 1,
    })
    expect(acknowledgement.data.auction).toMatchObject({
      currentBid: 1100,
      currentBidder: {
        id: bidder.id,
        name: 'Bidder One',
        avatarUrl: null,
      },
      bidCount: 1,
      sequence: 1,
      version: 1,
    })
    expect(senderUpdate).toEqual(observerUpdate)
    expect(observerUpdate).toMatchObject({
      auctionId: auction.id,
      auction: {
        id: auction.id,
        status: 'ACTIVE',
        currentBid: 1100,
        currentBidder: { id: bidder.id, name: 'Bidder One' },
        bidCount: 1,
        sequence: 1,
      },
      latestBid: {
        amount: 1100,
        sequence: 1,
        bidder: { id: bidder.id, name: 'Bidder One' },
      },
      timelineEvent: {
        type: 'BID_ACCEPTED',
        actor: { id: bidder.id, name: 'Bidder One' },
      },
      serverTime: expect.any(Number),
    })
    expect(storedAuction.currentBid).toBe(1100)
    expect(storedBid.serverSequence).toBe(1)
    expect(timelineEvent.metadata.bidSequence).toBe(1)
  })

  it('does not broadcast an accepted bid into another auction room', async () => {
    const [sellerA, sellerB, bidder, observer] = await Promise.all([
      createUser('Seller Room A'),
      createUser('Seller Room B'),
      createUser('Bidder Room A'),
      createUser('Observer Room B'),
    ])
    const [auctionA, auctionB] = await Promise.all([
      createAuction(sellerA),
      createAuction(sellerB),
    ])
    const [bidderClient, observerClient] = await Promise.all([
      connectUser(bidder),
      connectUser(observer),
    ])
    await Promise.all([
      joinBidder(bidderClient, auctionA.id),
      joinBidder(observerClient, auctionB.id),
    ])
    let crossedRooms = false
    observerClient.on('auction_state_updated', (update) => {
      crossedRooms ||= update.auctionId === auctionA.id
    })
    const acceptedUpdate = new Promise((resolve) => {
      bidderClient.once('auction_state_updated', resolve)
    })

    const acknowledgement = await emitWithAck(bidderClient, 'place_bid', {
      auctionId: auctionA.id,
      amount: 1100,
      clientBidId: 'isolated-bid-1',
    })
    await acceptedUpdate
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(acknowledgement.success).toBe(true)
    expect(crossedRooms).toBe(false)
  })

  it('includes the safe bidder identity in an accepted bid payload', async () => {
    const seller = await createUser('Identity Seller')
    const bidder = await createUser('Identity Bidder', {
      avatar: 'https://example.com/bidder.png',
    })
    const auction = await createAuction(seller)
    const client = await connectUser(bidder)
    await joinBidder(client, auction.id)
    const updatePromise = new Promise((resolve) => {
      client.once('auction_state_updated', resolve)
    })

    await emitWithAck(client, 'place_bid', {
      auctionId: auction.id,
      amount: 1100,
      clientBidId: 'identity-bid-1',
    })
    const update = await updatePromise

    expect(update.latestBid.bidder).toEqual({
      id: bidder.id,
      name: 'Identity Bidder',
      avatarUrl: 'https://example.com/bidder.png',
    })
    expect(update.timelineEvent.actor).toMatchObject({
      id: bidder.id,
      name: 'Identity Bidder',
    })
    expect(update.latestBid.bidder).not.toHaveProperty('email')
    expect(update.latestBid.bidder).not.toHaveProperty('passwordHash')
  })

  it('rejects a bid below the authoritative minimum', async () => {
    const seller = await createUser('Seller Two')
    const bidder = await createUser('Bidder Two')
    const auction = await createAuction(seller)
    const client = await connectUser(bidder)
    await joinBidder(client, auction.id)
    const rejectionPromise = new Promise((resolve) => {
      client.once('bid_rejected', resolve)
    })

    const acknowledgement = await emitWithAck(client, 'place_bid', {
      auctionId: auction.id,
      amount: 1099,
      clientBidId: 'low-bid-1',
    })
    const rejection = await rejectionPromise

    expect(acknowledgement).toEqual({
      success: false,
      message: 'Bid must be at least 1100',
    })
    expect(rejection).toEqual(acknowledgement)
    expect(await Bid.countDocuments({ auction: auction.id })).toBe(0)
  })

  it('rejects a seller bidding on their own auction', async () => {
    const seller = await createUser('Seller Three')
    const auction = await createAuction(seller)
    const client = await connectUser(seller)
    await joinBidder(client, auction.id)

    const acknowledgement = await emitWithAck(client, 'place_bid', {
      auctionId: auction.id,
      amount: 1100,
      clientBidId: 'seller-bid-1',
    })

    expect(acknowledgement).toEqual({
      success: false,
      message: 'Seller cannot bid on own auction',
    })
    expect(await Bid.countDocuments({ auction: auction.id })).toBe(0)
  })

  it('does not process a duplicate clientBidId twice', async () => {
    const seller = await createUser('Seller Four')
    const bidder = await createUser('Bidder Four')
    const auction = await createAuction(seller)
    const client = await connectUser(bidder)
    await joinBidder(client, auction.id)
    let acceptedUpdateCount = 0
    client.on('auction_state_updated', () => {
      acceptedUpdateCount += 1
    })

    const first = await emitWithAck(client, 'place_bid', {
      auctionId: auction.id,
      amount: 1100,
      clientBidId: 'duplicate-bid-1',
    })
    const duplicate = await emitWithAck(client, 'place_bid', {
      auctionId: auction.id,
      amount: 1200,
      clientBidId: 'duplicate-bid-1',
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    const storedAuction = await Auction.findById(auction.id)

    expect(first.success).toBe(true)
    expect(duplicate).toEqual({
      success: false,
      message: 'Duplicate bid request',
    })
    expect(await Bid.countDocuments({ auction: auction.id })).toBe(1)
    expect(
      await Timeline.countDocuments({
        auction: auction.id,
        eventType: 'BID_ACCEPTED',
      }),
    ).toBe(1)
    expect(storedAuction).toMatchObject({
      currentBid: 1100,
      bidCount: 1,
      sequence: 1,
    })
    expect(acceptedUpdateCount).toBe(1)
  })

  it('orders two concurrent bids with sequential server sequences', async () => {
    const seller = await createUser('Seller Five')
    const bidder = await createUser('Bidder Five')
    const auction = await createAuction(seller)
    const client = await connectUser(bidder)
    await joinBidder(client, auction.id)

    const firstPromise = emitWithAck(client, 'place_bid', {
      auctionId: auction.id,
      amount: 1100,
      clientBidId: 'concurrent-bid-1',
    })
    const secondPromise = emitWithAck(client, 'place_bid', {
      auctionId: auction.id,
      amount: 1200,
      clientBidId: 'concurrent-bid-2',
    })
    const [first, second] = await Promise.all([firstPromise, secondPromise])
    const bids = await Bid.find({ auction: auction.id }).sort({
      serverSequence: 1,
    })
    const storedAuction = await Auction.findById(auction.id)
    const timeline = await Timeline.find({
      auction: auction.id,
      eventType: 'BID_ACCEPTED',
    }).sort({ sequence: 1 })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(bids.map((bid) => bid.serverSequence)).toEqual([1, 2])
    expect(bids.map((bid) => bid.amount)).toEqual([1100, 1200])
    expect(timeline.map((event) => event.sequence)).toEqual([1, 2])
    expect(storedAuction).toMatchObject({
      currentBid: 1200,
      bidCount: 2,
      sequence: 2,
    })
  })

  it('rejects a bid at or after endAt', async () => {
    const seller = await createUser('Seller Six')
    const bidder = await createUser('Bidder Six')
    const auction = await createAuction(seller, {
      endAt: new Date(Date.now() - 1),
    })
    const client = await connectUser(bidder)
    await joinBidder(client, auction.id)

    const acknowledgement = await emitWithAck(client, 'place_bid', {
      auctionId: auction.id,
      amount: 1100,
      clientBidId: 'late-bid-1',
    })

    expect(acknowledgement).toEqual({
      success: false,
      message: 'Auction has ended',
    })
    expect(await Bid.countDocuments({ auction: auction.id })).toBe(0)
  })
})
