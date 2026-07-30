import mongoose from 'mongoose'
import { Server } from 'socket.io'

import { corsOptions } from '../config/cors.js'
import { createAuctionBidQueue } from '../engine/auction-bid-queue.js'
import { User } from '../models/user.model.js'
import { loadAuctionSnapshotData } from '../services/auction-snapshot.service.js'
import {
  BidRejectedError,
  processBid,
} from '../services/bid.service.js'
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '../utils/session.js'

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

function roomName(auctionId) {
  // Auction-prefixed rooms keep every broadcast isolated to one auction.
  return 'auction:' + auctionId
}

function createPresenceStore() {
  const auctions = new Map()

  function set(auctionId, socketId, role) {
    const members = auctions.get(auctionId) ?? new Map()
    members.set(socketId, role)
    auctions.set(auctionId, members)
  }

  function remove(auctionId, socketId) {
    const members = auctions.get(auctionId)

    if (!members) {
      return
    }

    members.delete(socketId)

    if (members.size === 0) {
      auctions.delete(auctionId)
    }
  }

  function counts(auctionId) {
    const roles = auctions.get(auctionId)?.values() ?? []
    let activeBidderCount = 0
    let spectatorCount = 0

    for (const role of roles) {
      activeBidderCount += role === 'BIDDER' ? 1 : 0
      spectatorCount += role === 'SPECTATOR' ? 1 : 0
    }

    return { activeBidderCount, spectatorCount }
  }

  return { counts, remove, set }
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

function registerRoomHandlers(io, socket, presenceStore, bidQueue) {
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

      const role = decideRole(socket, data.auction, payload.mode)
      await socket.join(roomName(auctionId))
      socket.data.auctionRoles.set(auctionId, role)
      presenceStore.set(auctionId, socket.id, role)

      socket.emit(
        'auction_snapshot',
        buildSnapshot(
          data,
          role,
          presenceStore.counts(auctionId),
        ),
      )
      emitPresence(io, presenceStore, auctionId)
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
      success(acknowledge)
    } catch {
      failure(acknowledge, 'Unable to load auction snapshot')
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

  io.use(async (socket, next) => {
    await attachVerifiedIdentity(socket)
    next()
  })

  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket, presenceStore, bidQueue)
  })

  return io
}
