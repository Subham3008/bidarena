import { Server } from 'socket.io'

import { env } from '../config/env.js'
import { User } from '../models/user.model.js'
import { loadAuctionSnapshotData } from '../services/auction-snapshot.service.js'
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
  if (!payload || typeof payload.auctionId !== 'string') {
    return false
  }

  return (
    !includeMode ||
    payload.mode === 'BIDDER' ||
    payload.mode === 'SPECTATOR'
  )
}

function success(acknowledge) {
  if (typeof acknowledge === 'function') {
    acknowledge({ success: true, data: {} })
  }
}

function failure(acknowledge, message) {
  if (typeof acknowledge === 'function') {
    acknowledge({ success: false, message })
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

function registerRoomHandlers(io, socket, presenceStore) {
  socket.data.auctionRoles = new Map()

  socket.on('join_auction', async (payload, acknowledge) => {
    if (!isAuctionPayload(payload, true)) {
      failure(acknowledge, 'Invalid join_auction payload')
      return
    }

    if (payload.mode === 'BIDDER' && !socket.data.user) {
      failure(acknowledge, 'Authentication required for BIDDER mode')
      return
    }

    try {
      const data = await loadAuctionSnapshotData(payload.auctionId)

      if (!data) {
        failure(acknowledge, 'Auction not found')
        return
      }

      const role = decideRole(socket, data.auction, payload.mode)
      await socket.join(roomName(payload.auctionId))
      socket.data.auctionRoles.set(payload.auctionId, role)
      presenceStore.set(payload.auctionId, socket.id, role)

      socket.emit(
        'auction_snapshot',
        buildSnapshot(
          data,
          role,
          presenceStore.counts(payload.auctionId),
        ),
      )
      emitPresence(io, presenceStore, payload.auctionId)
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

    const wasJoined = socket.data.auctionRoles.has(payload.auctionId)

    if (wasJoined) {
      await socket.leave(roomName(payload.auctionId))
      socket.data.auctionRoles.delete(payload.auctionId)
      presenceStore.remove(payload.auctionId, socket.id)
      emitPresence(io, presenceStore, payload.auctionId)
    }

    success(acknowledge)
  })

  socket.on('request_auction_snapshot', async (payload, acknowledge) => {
    if (!isAuctionPayload(payload)) {
      failure(acknowledge, 'Invalid request_auction_snapshot payload')
      return
    }

    const role = socket.data.auctionRoles.get(payload.auctionId)

    if (!role) {
      failure(acknowledge, 'Join the auction room before requesting a snapshot')
      return
    }

    try {
      // Reconnect recovery always replaces client guesses with MongoDB state.
      const data = await loadAuctionSnapshotData(payload.auctionId)

      if (!data) {
        failure(acknowledge, 'Auction not found')
        return
      }

      socket.emit(
        'auction_snapshot',
        buildSnapshot(
          data,
          role,
          presenceStore.counts(payload.auctionId),
        ),
      )
      success(acknowledge)
    } catch {
      failure(acknowledge, 'Unable to load auction snapshot')
    }
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
    cors: {
      origin: env.clientUrl,
      credentials: true,
    },
  })
  const presenceStore = createPresenceStore()

  io.use(async (socket, next) => {
    await attachVerifiedIdentity(socket)
    next()
  })

  io.on('connection', (socket) => {
    registerRoomHandlers(io, socket, presenceStore)
  })

  return io
}
