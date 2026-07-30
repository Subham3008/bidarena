import { createServer } from 'node:http'

import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { io as createClient } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import Auction from '../models/auction.model.js'
import Bid from '../models/bid.model.js'
import ChatMessage from '../models/chat-message.model.js'
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
  let userNumber = 0

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough'
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())
    await ChatMessage.init()

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
      ChatMessage.deleteMany({}),
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

  function waitForEvent(client, eventName, predicate = () => true) {
    return new Promise((resolve) => {
      const listener = (payload) => {
        if (!predicate(payload)) {
          return
        }

        client.off(eventName, listener)
        resolve(payload)
      }

      client.on(eventName, listener)
    })
  }

  async function createUser(displayName, overrides = {}) {
    userNumber += 1
    return User.create({
      displayName,
      email: `realtime-user-${userNumber}@example.com`,
      passwordHash: 'stored-password-hash',
      ...overrides,
    })
  }

  function authenticatedOptions(user) {
    const token = createSessionToken(user.id)

    return {
      extraHeaders: {
        Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      },
    }
  }

  function nextPresence(client) {
    return new Promise((resolve) => {
      client.once('presence_updated', resolve)
    })
  }

  function joinAuction(client, auctionId, mode) {
    return emitWithAck(client, 'join_auction', { auctionId, mode })
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

  it('persists and broadcasts a valid message from an authenticated joined bidder', async () => {
    const sender = await createUser('Chat Sender', {
      avatar: 'https://example.com/chat-sender.png',
    })
    const auction = await createAuction()
    const client = await connectClient(authenticatedOptions(sender))
    await joinAuction(client, auction.id, 'BIDDER')
    const messagePromise = waitForEvent(
      client,
      'chat_message',
      (event) => event.auctionId === auction.id,
    )

    const acknowledgement = await emitWithAck(
      client,
      'send_chat_message',
      {
        auctionId: auction.id,
        text: '  Is pickup available?  ',
        clientMessageId: 'chat-valid-1',
      },
    )
    const event = await messagePromise
    const storedMessage = await ChatMessage.findOne({
      auction: auction.id,
    })
    const historyPromise = waitForEvent(
      client,
      'chat_history',
      (history) => history.auctionId === auction.id,
    )
    const historyAck = await emitWithAck(
      client,
      'request_chat_history',
      { auctionId: auction.id },
    )
    const history = await historyPromise

    expect(acknowledgement.success).toBe(true)
    expect(event.chatMessage).toMatchObject({
      auctionId: auction.id,
      text: 'Is pickup available?',
      clientMessageId: 'chat-valid-1',
      sender: {
        id: sender.id,
        name: 'Chat Sender',
        avatarUrl: 'https://example.com/chat-sender.png',
      },
    })
    expect(event.chatMessage.sender).toEqual({
      id: sender.id,
      name: 'Chat Sender',
      avatarUrl: 'https://example.com/chat-sender.png',
    })
    expect(storedMessage.text).toBe('Is pickup available?')
    expect(historyAck).toEqual({ success: true, data: {} })
    expect(history.messages).toEqual([event.chatMessage])
  })

  it('keeps anonymous spectators read-only while allowing them to receive chat', async () => {
    const sender = await createUser('Readable Chat Sender')
    const auction = await createAuction()
    const [senderClient, anonymousClient] = await Promise.all([
      connectClient(authenticatedOptions(sender)),
      connectClient(),
    ])
    await Promise.all([
      joinAuction(senderClient, auction.id, 'BIDDER'),
      joinAuction(anonymousClient, auction.id, 'SPECTATOR'),
    ])
    let senderReceivedRejection = false
    senderClient.on('chat_message_rejected', () => {
      senderReceivedRejection = true
    })
    const rejectionPromise = waitForEvent(
      anonymousClient,
      'chat_message_rejected',
    )

    const anonymousAck = await emitWithAck(
      anonymousClient,
      'send_chat_message',
      {
        auctionId: auction.id,
        text: 'Anonymous message',
        clientMessageId: 'anonymous-chat-1',
      },
    )
    const rejection = await rejectionPromise
    const receivedMessagePromise = waitForEvent(
      anonymousClient,
      'chat_message',
      (event) => event.auctionId === auction.id,
    )
    const senderAck = await emitWithAck(
      senderClient,
      'send_chat_message',
      {
        auctionId: auction.id,
        text: 'Visible to spectators',
        clientMessageId: 'visible-chat-1',
      },
    )
    const receivedMessage = await receivedMessagePromise

    expect(anonymousAck).toEqual({
      success: false,
      message: 'Authentication required to send chat',
    })
    expect(rejection).toEqual(anonymousAck)
    expect(senderAck.success).toBe(true)
    expect(receivedMessage.chatMessage.text).toBe('Visible to spectators')
    expect(senderReceivedRejection).toBe(false)
  })

  it('keeps chat messages isolated to their auction room', async () => {
    const sender = await createUser('Isolated Chat Sender')
    const [auctionA, auctionB] = await Promise.all([
      createAuction({ title: 'Chat Auction A' }),
      createAuction({ title: 'Chat Auction B' }),
    ])
    const [clientA, clientB] = await Promise.all([
      connectClient(authenticatedOptions(sender)),
      connectClient(),
    ])
    await Promise.all([
      joinAuction(clientA, auctionA.id, 'BIDDER'),
      joinAuction(clientB, auctionB.id, 'SPECTATOR'),
    ])
    let crossedRooms = false
    clientB.on('chat_message', (event) => {
      crossedRooms ||= event.auctionId === auctionA.id
    })
    const messagePromise = waitForEvent(
      clientA,
      'chat_message',
      (event) => event.auctionId === auctionA.id,
    )

    await emitWithAck(clientA, 'send_chat_message', {
      auctionId: auctionA.id,
      text: 'Auction A only',
      clientMessageId: 'isolated-chat-1',
    })
    await messagePromise
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(crossedRooms).toBe(false)
  })

  it('does not persist or broadcast a duplicate clientMessageId twice', async () => {
    const sender = await createUser('Idempotent Chat Sender')
    const auction = await createAuction()
    const client = await connectClient(authenticatedOptions(sender))
    await joinAuction(client, auction.id, 'BIDDER')
    let broadcastCount = 0
    client.on('chat_message', () => {
      broadcastCount += 1
    })

    const first = await emitWithAck(client, 'send_chat_message', {
      auctionId: auction.id,
      text: 'Send once',
      clientMessageId: 'duplicate-chat-1',
    })
    const duplicate = await emitWithAck(client, 'send_chat_message', {
      auctionId: auction.id,
      text: 'Do not send twice',
      clientMessageId: 'duplicate-chat-1',
    })
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(first.success).toBe(true)
    expect(duplicate).toEqual({
      success: false,
      message: 'Duplicate chat message',
    })
    expect(await ChatMessage.countDocuments({ sender: sender.id })).toBe(1)
    expect(broadcastCount).toBe(1)
  })

  it('rate limits a verified user after five messages in ten seconds', async () => {
    const sender = await createUser('Rate Limited Sender')
    const auction = await createAuction()
    const client = await connectClient(authenticatedOptions(sender))
    await joinAuction(client, auction.id, 'BIDDER')
    const acknowledgements = []

    for (let index = 1; index <= 6; index += 1) {
      acknowledgements.push(
        await emitWithAck(client, 'send_chat_message', {
          auctionId: auction.id,
          text: `Rate message ${index}`,
          clientMessageId: `rate-chat-${index}`,
        }),
      )
    }

    expect(
      acknowledgements.slice(0, 5).every((result) => result.success),
    ).toBe(true)
    expect(acknowledgements[5]).toEqual({
      success: false,
      message: 'Chat rate limit exceeded; try again shortly',
    })
    expect(await ChatMessage.countDocuments({ sender: sender.id })).toBe(5)
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

  it('counts one bidder across multiple sockets and removes one socket at a time', async () => {
    const bidder = await User.create({
      displayName: 'Multi-tab Bidder',
      email: 'multi-tab-bidder@example.com',
      passwordHash: 'stored-password-hash',
    })
    const auction = await createAuction()
    const [observer, firstTab, secondTab] = await Promise.all([
      connectClient(),
      connectClient(authenticatedOptions(bidder)),
      connectClient(authenticatedOptions(bidder)),
    ])
    await emitWithAck(observer, 'join_auction', {
      auctionId: auction.id,
      mode: 'SPECTATOR',
    })

    let updatePromise = nextPresence(observer)
    await emitWithAck(firstTab, 'join_auction', {
      auctionId: auction.id,
      mode: 'BIDDER',
    })
    expect(await updatePromise).toMatchObject({
      activeBidderCount: 1,
      spectatorCount: 1,
    })

    updatePromise = nextPresence(observer)
    await emitWithAck(secondTab, 'join_auction', {
      auctionId: auction.id,
      mode: 'BIDDER',
    })
    expect(await updatePromise).toMatchObject({
      activeBidderCount: 1,
      spectatorCount: 1,
    })

    updatePromise = nextPresence(observer)
    firstTab.disconnect()
    expect(await updatePromise).toMatchObject({
      activeBidderCount: 1,
      spectatorCount: 1,
    })

    updatePromise = nextPresence(observer)
    await emitWithAck(secondTab, 'leave_auction', {
      auctionId: auction.id,
    })
    expect(await updatePromise).toMatchObject({
      activeBidderCount: 0,
      spectatorCount: 1,
    })
  })

  it('counts authenticated spectators by identity and anonymous spectators by connection', async () => {
    const spectator = await User.create({
      displayName: 'Multi-tab Spectator',
      email: 'multi-tab-spectator@example.com',
      passwordHash: 'stored-password-hash',
    })
    const auction = await createAuction()
    const [anonymous, firstTab, secondTab] = await Promise.all([
      connectClient(),
      connectClient(authenticatedOptions(spectator)),
      connectClient(authenticatedOptions(spectator)),
    ])
    await emitWithAck(anonymous, 'join_auction', {
      auctionId: auction.id,
      mode: 'SPECTATOR',
    })

    let updatePromise = nextPresence(anonymous)
    await emitWithAck(firstTab, 'join_auction', {
      auctionId: auction.id,
      mode: 'SPECTATOR',
    })
    expect((await updatePromise).spectatorCount).toBe(2)

    updatePromise = nextPresence(anonymous)
    await emitWithAck(secondTab, 'join_auction', {
      auctionId: auction.id,
      mode: 'SPECTATOR',
    })
    expect((await updatePromise).spectatorCount).toBe(2)

    updatePromise = nextPresence(anonymous)
    firstTab.disconnect()
    expect((await updatePromise).spectatorCount).toBe(2)

    updatePromise = nextPresence(anonymous)
    await emitWithAck(secondTab, 'leave_auction', {
      auctionId: auction.id,
    })
    expect((await updatePromise).spectatorCount).toBe(1)
  })

  it('updates unique participant statistics on join and per-socket leave', async () => {
    const bidder = await createUser('Statistics Bidder')
    const spectator = await createUser('Statistics Spectator')
    const auction = await createAuction()
    const [
      observer,
      firstTab,
      secondTab,
      firstSpectatorTab,
      secondSpectatorTab,
    ] = await Promise.all([
      connectClient(),
      connectClient(authenticatedOptions(bidder)),
      connectClient(authenticatedOptions(bidder)),
      connectClient(authenticatedOptions(spectator)),
      connectClient(authenticatedOptions(spectator)),
    ])
    await joinAuction(observer, auction.id, 'SPECTATOR')

    let statsPromise = waitForEvent(
      observer,
      'auction_stats_updated',
      (event) =>
        event.auctionId === auction.id && event.stats.bidderCount === 1,
    )
    await joinAuction(firstTab, auction.id, 'BIDDER')
    expect((await statsPromise).stats).toMatchObject({
      bidderCount: 1,
      spectatorCount: 1,
      bidCount: 0,
    })

    statsPromise = waitForEvent(
      observer,
      'auction_stats_updated',
      (event) => event.auctionId === auction.id,
    )
    await joinAuction(secondTab, auction.id, 'BIDDER')
    expect((await statsPromise).stats.bidderCount).toBe(1)

    statsPromise = waitForEvent(
      observer,
      'auction_stats_updated',
      (event) => event.auctionId === auction.id,
    )
    firstTab.disconnect()
    expect((await statsPromise).stats.bidderCount).toBe(1)

    statsPromise = waitForEvent(
      observer,
      'auction_stats_updated',
      (event) => event.auctionId === auction.id,
    )
    await emitWithAck(secondTab, 'leave_auction', {
      auctionId: auction.id,
    })
    expect((await statsPromise).stats).toMatchObject({
      bidderCount: 0,
      spectatorCount: 1,
    })

    statsPromise = waitForEvent(
      observer,
      'auction_stats_updated',
      (event) => event.auctionId === auction.id,
    )
    await joinAuction(firstSpectatorTab, auction.id, 'SPECTATOR')
    expect((await statsPromise).stats.spectatorCount).toBe(2)

    statsPromise = waitForEvent(
      observer,
      'auction_stats_updated',
      (event) => event.auctionId === auction.id,
    )
    await joinAuction(secondSpectatorTab, auction.id, 'SPECTATOR')
    expect((await statsPromise).stats.spectatorCount).toBe(2)

    statsPromise = waitForEvent(
      observer,
      'auction_stats_updated',
      (event) => event.auctionId === auction.id,
    )
    await emitWithAck(firstSpectatorTab, 'leave_auction', {
      auctionId: auction.id,
    })
    expect((await statsPromise).stats.spectatorCount).toBe(2)

    statsPromise = waitForEvent(
      observer,
      'auction_stats_updated',
      (event) => event.auctionId === auction.id,
    )
    await emitWithAck(secondSpectatorTab, 'leave_auction', {
      auctionId: auction.id,
    })
    expect((await statsPromise).stats.spectatorCount).toBe(1)

    const requestedStatsPromise = waitForEvent(
      observer,
      'auction_stats_updated',
      (event) => event.auctionId === auction.id,
    )
    const requestedHeatPromise = waitForEvent(
      observer,
      'auction_heat_updated',
      (event) => event.auctionId === auction.id,
    )
    const requestAck = await emitWithAck(
      observer,
      'request_auction_stats',
      { auctionId: auction.id },
    )
    const [requestedStats, requestedHeat] = await Promise.all([
      requestedStatsPromise,
      requestedHeatPromise,
    ])

    expect(requestAck).toEqual({ success: true, data: {} })
    expect(requestedStats.stats.bidderCount).toBe(0)
    expect(requestedHeat).toMatchObject({
      heat: 'COLD',
      recentBidCount: 0,
      windowSeconds: 60,
    })
  })

  it('restores enriched persisted winner and bid state after reconnect', async () => {
    const winner = await User.create({
      displayName: 'Reconnect Winner',
      email: 'reconnect-winner@example.com',
      avatar: 'https://example.com/reconnect-winner.png',
      passwordHash: 'stored-password-hash',
    })
    const auction = await createAuction({
      status: 'COMPLETED',
      currentBid: 1700,
      currentBidder: winner.id,
      winner: winner.id,
      winningAmount: 1700,
      bidCount: 1,
      sequence: 1,
      timelineSequence: 3,
    })
    await Bid.create({
      auction: auction.id,
      bidder: winner.id,
      amount: 1700,
      clientBidId: 'reconnect-bid-1',
      serverSequence: 1,
    })
    await Timeline.insertMany([
      {
        auction: auction.id,
        eventType: 'BID_ACCEPTED',
        actor: winner.id,
        sequence: 1,
        metadata: { amount: 1700, bidSequence: 1 },
      },
      {
        auction: auction.id,
        eventType: 'AUCTION_COMPLETED',
        sequence: 2,
        metadata: { finalBid: 1700 },
      },
      {
        auction: auction.id,
        eventType: 'WINNER_DECLARED',
        actor: winner.id,
        sequence: 3,
        metadata: { winningBid: 1700 },
      },
    ])

    async function connectAndLoadSnapshot() {
      const client = await connectClient()
      const snapshotPromise = new Promise((resolve) => {
        client.once('auction_snapshot', resolve)
      })
      await emitWithAck(client, 'join_auction', {
        auctionId: auction.id,
        mode: 'SPECTATOR',
      })
      return { client, snapshot: await snapshotPromise }
    }

    const firstConnection = await connectAndLoadSnapshot()
    firstConnection.client.disconnect()
    const reconnected = await connectAndLoadSnapshot()

    expect(reconnected.snapshot.auction).toMatchObject({
      id: auction.id,
      status: 'COMPLETED',
      currentBid: 1700,
      currentBidder: { id: winner.id, name: 'Reconnect Winner' },
      winner: { id: winner.id, name: 'Reconnect Winner' },
      winningAmount: 1700,
      bidCount: 1,
      sequence: 1,
    })
    expect(reconnected.snapshot.latestBids[0]).toMatchObject({
      amount: 1700,
      sequence: 1,
      bidder: {
        id: winner.id,
        name: 'Reconnect Winner',
        avatarUrl: 'https://example.com/reconnect-winner.png',
      },
    })
    expect(reconnected.snapshot.timeline.at(-1)).toMatchObject({
      type: 'WINNER_DECLARED',
      winner: { id: winner.id, name: 'Reconnect Winner' },
    })
    expect(reconnected.snapshot.auction).toEqual(
      firstConnection.snapshot.auction,
    )
    expect(reconnected.snapshot.latestBids).toEqual(
      firstConnection.snapshot.latestBids,
    )
    expect(reconnected.snapshot.timeline).toEqual(
      firstConnection.snapshot.timeline,
    )
    expect(reconnected.snapshot.serverTime).toEqual(expect.any(Number))
  })
})
