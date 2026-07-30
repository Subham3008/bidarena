import mongoose from 'mongoose'
import { Server } from 'socket.io'

import { corsOptions } from '../config/cors.js'
import { createAuctionBidQueue } from '../engine/auction-bid-queue.js'
import { User } from '../models/user.model.js'
import { loadAuctionRealtimeState } from '../services/auction-stats.service.js'
import { loadAuctionSnapshotData } from '../services/auction-snapshot.service.js'
import {
  BidRejectedError,
  processBid,
} from '../services/bid.service.js'
import {
  ChatRejectedError,
  createChatMessage,
  loadChatHistory,
  normalizeChatMessageInput,
} from '../services/chat.service.js'
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '../utils/session.js'

const realtimePublishers = new WeakMap()

function readCookie(cookieHeader, name) {
  if (typeof cookieHeader !== 'string') {
    return null
  }

  const prefix = name + '='
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))

  if (!cookie) {
    return null
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length))
  } catch {
    return null
  }
}

async function attachVerifiedIdentity(socket) {
  socket.data.user = null
  const token = readCookie(
    socket.handshake.headers.cookie,
    SESSION_COOKIE_NAME,
  )

  if (!token) {
    return
  }

  try {
    const payload = verifySessionToken(token)

    if (typeof payload.sub !== 'string') {
      return
    }

    const user = await User.findById(payload.sub).select('_id displayName')

    if (user) {
      // Only a verified cookie subject becomes trusted socket identity.
      socket.data.user = { id: user.id, displayName: user.displayName }
    }
  } catch {
    socket.data.user = null
  }
}

function isAuctionPayload(payload, includeMode = false) {
  if (
    !payload ||
    typeof payload.auctionId !== 'string' ||
    !mongoose.isObjectIdOrHexString(payload.auctionId)
  ) {
    return false
  }

  return (
    !includeMode ||
    payload.mode === 'BIDDER' ||
    payload.mode === 'SPECTATOR'
  )
}

function normalizeAuctionId(auctionId) {
  return new mongoose.Types.ObjectId(auctionId).toString()
}

function success(acknowledge, data = {}) {
  if (typeof acknowledge === 'function') {
    acknowledge({ success: true, data })
  }
}

function failure(acknowledge, message) {
  if (typeof acknowledge === 'function') {
    acknowledge({ success: false, message })
  }
}

function rejectBid(socket, acknowledge, message) {
  const rejection = { success: false, message }
  socket.emit('bid_rejected', rejection)

  if (typeof acknowledge === 'function') {
    acknowledge(rejection)
  }
}

function rejectChat(socket, acknowledge, message) {
  const rejection = { success: false, message }
  socket.emit('chat_message_rejected', rejection)

  if (typeof acknowledge === 'function') {
    acknowledge(rejection)
  }
}

function roomName(auctionId) {
  // Auction-prefixed rooms keep every broadcast isolated to one auction.
  return 'auction:' + auctionId
}

function createPresenceStore() {
  const auctions = new Map()

  function createAuctionPresence() {
    return {
      bidders: new Map(),
      sellers: new Map(),
      spectatorUsers: new Map(),
      anonymousSpectators: new Set(),
      sockets: new Map(),
    }
  }

  function addUserSocket(users, userId, socketId) {
    const socketIds = users.get(userId) ?? new Set()
    socketIds.add(socketId)
    users.set(userId, socketIds)
  }

  function removeUserSocket(users, userId, socketId) {
    const socketIds = users.get(userId)

    if (!socketIds) {
      return
    }

    socketIds.delete(socketId)

    if (socketIds.size === 0) {
      users.delete(userId)
    }
  }

  function removeSocket(members, socketId) {
    const membership = members.sockets.get(socketId)

    if (!membership) {
      return
    }

    if (membership.role === 'BIDDER') {
      removeUserSocket(members.bidders, membership.userId, socketId)
    } else if (membership.role === 'SELLER') {
      removeUserSocket(members.sellers, membership.userId, socketId)
    } else if (membership.userId) {
      removeUserSocket(
        members.spectatorUsers,
        membership.userId,
        socketId,
      )
    } else {
      members.anonymousSpectators.delete(socketId)
    }

    members.sockets.delete(socketId)
  }

  function set(auctionId, socketId, role, userId) {
    const members =
      auctions.get(auctionId) ?? createAuctionPresence()

    removeSocket(members, socketId)

    if (role === 'BIDDER') {
      addUserSocket(members.bidders, userId, socketId)
    } else if (role === 'SELLER') {
      addUserSocket(members.sellers, userId, socketId)
    } else if (userId) {
      addUserSocket(members.spectatorUsers, userId, socketId)
    } else {
      members.anonymousSpectators.add(socketId)
    }

    members.sockets.set(socketId, { role, userId })
    auctions.set(auctionId, members)
  }

  function remove(auctionId, socketId) {
    const members = auctions.get(auctionId)

    if (!members) {
      return
    }

    // Removing one tab keeps the authenticated identity present through its other sockets.
    removeSocket(members, socketId)

    if (members.sockets.size === 0) {
      auctions.delete(auctionId)
    }
  }

  function counts(auctionId) {
    const members = auctions.get(auctionId)

    if (!members) {
      return { activeBidderCount: 0, spectatorCount: 0 }
    }

    return {
      activeBidderCount: members.bidders.size,
      spectatorCount:
        members.spectatorUsers.size +
        members.anonymousSpectators.size,
    }
  }

  return { counts, remove, set }
}

function createChatRateLimiter() {
  const attemptsByUser = new Map()
  const limit = 5
  const windowMs = 10_000

  function consume(userId, now = Date.now()) {
    // A shared user bucket prevents multiple sockets from bypassing the chat limit.
    const windowStart = now - windowMs
    const attempts = (attemptsByUser.get(userId) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    )

    if (attempts.length >= limit) {
      attemptsByUser.set(userId, attempts)
      return false
    }

    attempts.push(now)
    attemptsByUser.set(userId, attempts)
    return true
  }

  return { consume }
}

function createRealtimePublisher(io, presenceStore) {
  const queueTails = new Map()

  async function publish(
    auctionId,
    { target = io.to(roomName(auctionId)), includeHeat = true } = {},
  ) {
    const realtime = await loadAuctionRealtimeState(
      auctionId,
      presenceStore.counts(auctionId),
    )

    if (!realtime) {
      return false
    }

    const serverTime = Date.now()
    const presence = presenceStore.counts(auctionId)

    // Every live metric broadcast stays scoped to its authoritative auction room.
    target.emit('auction_stats_updated', {
      auctionId,
      stats: {
        ...realtime.stats,
        bidderCount: presence.activeBidderCount,
        spectatorCount: presence.spectatorCount,
      },
      serverTime,
    })

    if (includeHeat) {
      target.emit('auction_heat_updated', {
        auctionId,
        ...realtime.heat,
        serverTime,
      })
    }

    return true
  }

  return (auctionId, options) => {
    // Same-auction refreshes serialize so an older database read cannot emit last.
    const previous = queueTails.get(auctionId) ?? Promise.resolve()
    const result = previous.then(() => publish(auctionId, options))
    const tail = result
      .catch(() => {})
      .finally(() => {
        if (queueTails.get(auctionId) === tail) {
          queueTails.delete(auctionId)
        }
      })

    queueTails.set(auctionId, tail)
    return result
  }
}

async function publishSafely(publisher, auctionId, options) {
  try {
    return await publisher(auctionId, options)
  } catch {
    return false
  }
}

export async function publishAuctionRealtime(io, auctionId) {
  const publisher = realtimePublishers.get(io)

  if (!publisher) {
    return false
  }

  return publisher(auctionId)
}

function decideRole(socket, auction, mode) {
  // Client mode is intent only; verified identity and auction ownership decide role.
  if (socket.data.user?.id === auction.seller) {
    return 'SELLER'
  }

  if (mode === 'BIDDER') {
    return 'BIDDER'
  }

  return 'SPECTATOR'
}

function buildSnapshot(data, currentUserRole, presence) {
  return {
    ...data,
    serverTime: Date.now(),
    ...presence,
    currentUserRole,
  }
}

function emitPresence(io, presenceStore, auctionId) {
  io.to(roomName(auctionId)).emit('presence_updated', {
    auctionId,
    ...presenceStore.counts(auctionId),
    serverTime: Date.now(),
  })
}

function registerRoomHandlers(
  io,
  socket,
  presenceStore,
  bidQueue,
  chatRateLimiter,
  realtimePublisher,
) {
  socket.data.auctionRoles = new Map()

  socket.on('join_auction', async (payload, acknowledge) => {
    if (!isAuctionPayload(payload, true)) {
      failure(acknowledge, 'Invalid join_auction payload')
      return
    }

    const auctionId = normalizeAuctionId(payload.auctionId)

    if (payload.mode === 'BIDDER' && !socket.data.user) {
      failure(acknowledge, 'Authentication required for BIDDER mode')
      return
    }

    try {
      const data = await loadAuctionSnapshotData(auctionId)

      if (!data) {
        failure(acknowledge, 'Auction not found')
        return
      }

      const chatHistory = await loadChatHistory(auctionId)

      const role = decideRole(socket, data.auction, payload.mode)
      await socket.join(roomName(auctionId))
      socket.data.auctionRoles.set(auctionId, role)
      presenceStore.set(
        auctionId,
        socket.id,
        role,
        socket.data.user?.id ?? null,
      )

      socket.emit(
        'auction_snapshot',
        buildSnapshot(
          data,
          role,
          presenceStore.counts(auctionId),
        ),
      )
      socket.emit('chat_history', {
        auctionId,
        messages: chatHistory,
        serverTime: Date.now(),
      })
      emitPresence(io, presenceStore, auctionId)
      await publishSafely(realtimePublisher, auctionId)
      success(acknowledge)
    } catch {
      failure(acknowledge, 'Unable to join auction')
    }
  })

  socket.on('leave_auction', async (payload, acknowledge) => {
    if (!isAuctionPayload(payload)) {
      failure(acknowledge, 'Invalid leave_auction payload')
      return
    }

    const auctionId = normalizeAuctionId(payload.auctionId)
    const wasJoined = socket.data.auctionRoles.has(auctionId)

    if (wasJoined) {
      await socket.leave(roomName(auctionId))
      socket.data.auctionRoles.delete(auctionId)
      presenceStore.remove(auctionId, socket.id)
      emitPresence(io, presenceStore, auctionId)
      await publishSafely(realtimePublisher, auctionId, {
        includeHeat: false,
      })
    }

    success(acknowledge)
  })

  socket.on('request_auction_snapshot', async (payload, acknowledge) => {
    if (!isAuctionPayload(payload)) {
      failure(acknowledge, 'Invalid request_auction_snapshot payload')
      return
    }

    const auctionId = normalizeAuctionId(payload.auctionId)
    const role = socket.data.auctionRoles.get(auctionId)

    if (!role) {
      failure(acknowledge, 'Join the auction room before requesting a snapshot')
      return
    }

    try {
      // Reconnect recovery always replaces client guesses with MongoDB state.
      const data = await loadAuctionSnapshotData(auctionId)

      if (!data) {
        failure(acknowledge, 'Auction not found')
        return
      }

      socket.emit(
        'auction_snapshot',
        buildSnapshot(
          data,
          role,
          presenceStore.counts(auctionId),
        ),
      )
      const chatHistory = await loadChatHistory(auctionId)
      socket.emit('chat_history', {
        auctionId,
        messages: chatHistory,
        serverTime: Date.now(),
      })
      await publishSafely(realtimePublisher, auctionId, {
        target: socket,
      })
      success(acknowledge)
    } catch {
      failure(acknowledge, 'Unable to load auction snapshot')
    }
  })

  socket.on('request_chat_history', async (payload, acknowledge) => {
    if (!isAuctionPayload(payload)) {
      failure(acknowledge, 'Invalid request_chat_history payload')
      return
    }

    const auctionId = normalizeAuctionId(payload.auctionId)

    if (!socket.data.auctionRoles.has(auctionId)) {
      failure(acknowledge, 'Join the auction room before requesting chat history')
      return
    }

    try {
      const messages = await loadChatHistory(auctionId)

      if (!messages) {
        failure(acknowledge, 'Auction not found')
        return
      }

      socket.emit('chat_history', {
        auctionId,
        messages,
        serverTime: Date.now(),
      })
      success(acknowledge)
    } catch {
      failure(acknowledge, 'Unable to load chat history')
    }
  })

  socket.on('send_chat_message', async (payload, acknowledge) => {
    if (!isAuctionPayload(payload)) {
      rejectChat(socket, acknowledge, 'Valid auctionId is required')
      return
    }

    if (!socket.data.user) {
      rejectChat(socket, acknowledge, 'Authentication required to send chat')
      return
    }

    const auctionId = normalizeAuctionId(payload.auctionId)
    const role = socket.data.auctionRoles.get(auctionId)

    if (!role) {
      rejectChat(socket, acknowledge, 'Join the auction room before sending chat')
      return
    }

    if (role !== 'SELLER' && role !== 'BIDDER') {
      rejectChat(socket, acknowledge, 'Spectators cannot send chat messages')
      return
    }

    let input

    try {
      input = normalizeChatMessageInput(payload)
    } catch (error) {
      const message =
        error instanceof ChatRejectedError
          ? error.message
          : 'Invalid chat message'
      rejectChat(socket, acknowledge, message)
      return
    }

    if (!chatRateLimiter.consume(socket.data.user.id)) {
      rejectChat(
        socket,
        acknowledge,
        'Chat rate limit exceeded; try again shortly',
      )
      return
    }

    try {
      const chatMessage = await createChatMessage({
        auctionId,
        senderId: socket.data.user.id,
        ...input,
      })
      const event = {
        auctionId,
        chatMessage,
        serverTime: Date.now(),
      }

      io.to(roomName(auctionId)).emit('chat_message', event)
      success(acknowledge, { chatMessage })
    } catch (error) {
      const message =
        error instanceof ChatRejectedError
          ? error.message
          : 'Unable to send chat message'
      rejectChat(socket, acknowledge, message)
    }
  })

  socket.on('request_auction_stats', async (payload, acknowledge) => {
    if (!isAuctionPayload(payload)) {
      failure(acknowledge, 'Invalid request_auction_stats payload')
      return
    }

    const auctionId = normalizeAuctionId(payload.auctionId)

    if (!socket.data.auctionRoles.has(auctionId)) {
      failure(acknowledge, 'Join the auction room before requesting statistics')
      return
    }

    try {
      const published = await realtimePublisher(auctionId, {
        target: socket,
      })

      if (!published) {
        failure(acknowledge, 'Auction not found')
        return
      }

      success(acknowledge)
    } catch {
      failure(acknowledge, 'Unable to load auction statistics')
    }
  })

  socket.on('place_bid', async (payload, acknowledge) => {
    if (!isAuctionPayload(payload)) {
      rejectBid(socket, acknowledge, 'Auction ID is required')
      return
    }

    if (!socket.data.user) {
      rejectBid(socket, acknowledge, 'Authentication required to bid')
      return
    }

    const auctionId = normalizeAuctionId(payload.auctionId)
    const role = socket.data.auctionRoles.get(auctionId)

    if (role === 'SELLER') {
      rejectBid(socket, acknowledge, 'Seller cannot bid on own auction')
      return
    }

    if (role === 'SPECTATOR') {
      rejectBid(socket, acknowledge, 'Spectators cannot bid')
      return
    }

    if (role !== 'BIDDER') {
      rejectBid(socket, acknowledge, 'Join auction as BIDDER before bidding')
      return
    }

    let result

    try {
      result = await bidQueue.enqueue(auctionId, async () => {
        const acceptedBid = await processBid({
          auctionId,
          bidderId: socket.data.user.id,
          amount: payload.amount,
          clientBidId: payload.clientBidId,
        })

        // The room update stays inside the queue and happens only after commit.
        io.to(roomName(auctionId)).emit('auction_state_updated', {
          auctionId,
          auction: acceptedBid.auction,
          latestBid: acceptedBid.latestBid,
          timelineEvent: acceptedBid.timelineEvent,
          serverTime: Date.now(),
        })
        // Metrics are best-effort after commit so a successful bid is never rejected later.
        await publishSafely(realtimePublisher, auctionId)

        return acceptedBid
      })
    } catch (error) {
      const message =
        error instanceof BidRejectedError
          ? error.message
          : 'Unable to process bid'
      rejectBid(socket, acknowledge, message)
      return
    }

    success(acknowledge, result)
  })

  socket.on('disconnect', () => {
    // Clean every tracked membership so disconnects cannot leave stale presence.
    for (const auctionId of socket.data.auctionRoles.keys()) {
      presenceStore.remove(auctionId, socket.id)
      emitPresence(io, presenceStore, auctionId)
      void publishSafely(realtimePublisher, auctionId, {
        includeHeat: false,
      })
    }

    socket.data.auctionRoles.clear()
  })
}

export function createAuctionSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: corsOptions,
  })
  const presenceStore = createPresenceStore()
  const bidQueue = createAuctionBidQueue()
  const chatRateLimiter = createChatRateLimiter()
  const realtimePublisher = createRealtimePublisher(io, presenceStore)
  realtimePublishers.set(io, realtimePublisher)

  io.use(async (socket, next) => {
    await attachVerifiedIdentity(socket)
    next()
  })

  io.on('connection', (socket) => {
    registerRoomHandlers(
      io,
      socket,
      presenceStore,
      bidQueue,
      chatRateLimiter,
      realtimePublisher,
    )
  })

  return io
}
