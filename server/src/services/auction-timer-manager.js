import mongoose from 'mongoose'

import Auction from '../models/auction.model.js'
import {
  completeAuction,
  recoverAuctionState,
} from './auction-lifecycle.service.js'
import { loadCompletedAuctionState } from './auction-payload.service.js'

const MAX_TIMEOUT_MS = 2_147_000_000
const RETRY_DELAY_MS = 1_000
let activeTimerManager = null

function auctionRoom(auctionId) {
  return 'auction:' + auctionId
}

function normalizeAuction(auction) {
  const auctionId = auction?._id ?? auction?.id

  if (!auctionId || !mongoose.isObjectIdOrHexString(auctionId)) {
    return null
  }

  return {
    auctionId: new mongoose.Types.ObjectId(auctionId).toString(),
    status: auction.status,
    startAt: new Date(auction.startAt),
    endAt: new Date(auction.endAt),
  }
}

function asIsoDate(value) {
  return new Date(value).toISOString()
}

export function createAuctionTimerManager(io, { syncIntervalMs = 1_000 } = {}) {
  const startTimers = new Map()
  const endTimers = new Map()
  const syncIntervals = new Map()
  const startTasks = new Map()
  const endTasks = new Map()
  const inFlightTasks = new Set()
  const completionBroadcasts = new Map()
  let stopped = false

  function clearHandle(handles, auctionId, clearHandle) {
    const handle = handles.get(auctionId)

    if (handle) {
      clearHandle(handle)
      handles.delete(auctionId)
    }
  }

  function clearAuction(auctionId) {
    clearHandle(startTimers, auctionId, clearTimeout)
    clearHandle(endTimers, auctionId, clearTimeout)
    clearHandle(syncIntervals, auctionId, clearInterval)
  }

  function clearAll() {
    // Shutdown and rescheduling clear every handle so stale callbacks cannot emit.
    for (const auctionId of new Set([
      ...startTimers.keys(),
      ...endTimers.keys(),
      ...syncIntervals.keys(),
    ])) {
      clearAuction(auctionId)
    }
  }

  function scheduleDeadline(handles, auctionId, targetTime, callback) {
    clearHandle(handles, auctionId, clearTimeout)

    if (stopped) {
      return
    }

    const delay = Math.max(0, targetTime - Date.now())
    const handle = setTimeout(() => {
      if (handles.get(auctionId) !== handle) {
        return
      }

      handles.delete(auctionId)

      if (targetTime > Date.now()) {
        scheduleDeadline(handles, auctionId, targetTime, callback)
        return
      }

      callback()
    }, Math.min(delay, MAX_TIMEOUT_MS))

    handle.unref?.()
    handles.set(auctionId, handle)
  }

  function trackUniqueTask(tasks, auctionId, operation, retry) {
    if (tasks.has(auctionId) || stopped) {
      return
    }

    const task = (async () => {
      try {
        await operation()
      } catch {
        console.error('Auction lifecycle timer failed for auction ' + auctionId)

        if (!stopped) {
          retry()
        }
      }
    })()

    tasks.set(auctionId, task)
    inFlightTasks.add(task)
    void task.finally(() => {
      tasks.delete(auctionId)
      inFlightTasks.delete(task)
    })
  }

  function emitStarted(auction) {
    if (stopped) {
      return
    }

    const auctionId = auction.id
    io.to(auctionRoom(auctionId)).emit('auction_started', {
      auctionId,
      status: 'ACTIVE',
      startAt: asIsoDate(auction.startAt),
      endAt: asIsoDate(auction.endAt),
      serverTime: Date.now(),
    })
  }

  async function emitCompleted(auctionId) {
    if (stopped) {
      return false
    }

    const existingBroadcast = completionBroadcasts.get(auctionId)

    if (existingBroadcast) {
      return existingBroadcast
    }

    const broadcast = (async () => {
      const state = await loadCompletedAuctionState(auctionId)

      if (!state || stopped) {
        return false
      }

      const serverTime = Date.now()
      const authoritativeUpdate = {
        auctionId,
        auction: state.auction,
        timelineEvent: state.timelineEvent,
        serverTime,
      }

      io.to(auctionRoom(auctionId)).emit('auction_completed', {
        ...authoritativeUpdate,
        status: state.auction.status,
        winner: state.auction.winner,
        winningAmount: state.auction.winningAmount,
        bidCount: state.auction.bidCount,
      })
      io.to(auctionRoom(auctionId)).emit(
        'auction_state_updated',
        authoritativeUpdate,
      )
      return true
    })()

    completionBroadcasts.set(auctionId, broadcast)

    try {
      const didBroadcast = await broadcast

      if (!didBroadcast) {
        completionBroadcasts.delete(auctionId)
      }

      return didBroadcast
    } catch (error) {
      completionBroadcasts.delete(auctionId)
      throw error
    }
  }

  function emitTimerSync(auction) {
    if (stopped) {
      return
    }

    const serverTime = Date.now()
    io.to(auctionRoom(auction.auctionId)).emit('timer_sync', {
      auctionId: auction.auctionId,
      status: 'ACTIVE',
      serverTime,
      startAt: asIsoDate(auction.startAt),
      endAt: asIsoDate(auction.endAt),
      remainingMs: Math.max(0, auction.endAt.getTime() - serverTime),
    })
  }

  function startTimerSync(auction) {
    clearHandle(syncIntervals, auction.auctionId, clearInterval)
    emitTimerSync(auction)

    const handle = setInterval(() => {
      emitTimerSync(auction)
    }, syncIntervalMs)

    handle.unref?.()
    syncIntervals.set(auction.auctionId, handle)
  }

  async function reconcileAuction(auctionId) {
    const auction = await Auction.findById(auctionId)
      .select('_id status startAt endAt')
      .lean()

    if (!auction) {
      clearAuction(auctionId)
      return
    }

    scheduleAuction(auction)
  }

  function retryStart(auctionId) {
    scheduleDeadline(
      startTimers,
      auctionId,
      Date.now() + RETRY_DELAY_MS,
      () => runStart(auctionId),
    )
  }

  function retryEnd(auctionId) {
    scheduleDeadline(
      endTimers,
      auctionId,
      Date.now() + RETRY_DELAY_MS,
      () => runEnd(auctionId),
    )
  }

  function runStart(auctionId) {
    trackUniqueTask(
      startTasks,
      auctionId,
      async () => {
        const result = await recoverAuctionState(auctionId, new Date())

        if (stopped) {
          return
        }

        if (result.activated) {
          emitStarted(result.activated)
        }

        if (result.completed) {
          clearAuction(auctionId)
          const didBroadcast = await emitCompleted(auctionId)

          if (!didBroadcast && !stopped) {
            throw new Error('Completed auction state is temporarily unavailable')
          }

          return
        }

        if (result.activated) {
          scheduleAuction(result.activated)
          return
        }

        if (!(await emitCompleted(auctionId))) {
          await reconcileAuction(auctionId)
        }
      },
      () => retryStart(auctionId),
    )
  }

  function runEnd(auctionId) {
    trackUniqueTask(
      endTasks,
      auctionId,
      async () => {
        clearHandle(syncIntervals, auctionId, clearInterval)
        const auction = await completeAuction(auctionId, new Date())

        if (stopped) {
          return
        }

        if (auction) {
          clearAuction(auctionId)
          const didBroadcast = await emitCompleted(auctionId)

          if (!didBroadcast && !stopped) {
            throw new Error('Completed auction state is temporarily unavailable')
          }

          return
        }

        if (await emitCompleted(auctionId)) {
          clearAuction(auctionId)
          return
        }

        await reconcileAuction(auctionId)
      },
      () => retryEnd(auctionId),
    )
  }

  function scheduleAuction(auctionValue) {
    const auction = normalizeAuction(auctionValue)

    if (!auction || stopped) {
      return
    }

    clearAuction(auction.auctionId)

    if (auction.status === 'UPCOMING') {
      scheduleDeadline(
        startTimers,
        auction.auctionId,
        auction.startAt.getTime(),
        () => runStart(auction.auctionId),
      )
      return
    }

    if (auction.status === 'ACTIVE') {
      if (auction.endAt.getTime() > Date.now()) {
        startTimerSync(auction)
      }

      scheduleDeadline(
        endTimers,
        auction.auctionId,
        auction.endAt.getTime(),
        () => runEnd(auction.auctionId),
      )
    }
  }

  async function schedulePersistedAuctions() {
    const auctions = await Auction.find({
      status: { $in: ['UPCOMING', 'ACTIVE'] },
    })
      .select('_id status startAt endAt')
      .lean()

    for (const auction of auctions) {
      scheduleAuction(auction)
    }
  }

  async function waitForIdle() {
    while (inFlightTasks.size > 0) {
      await Promise.allSettled([...inFlightTasks])
    }
  }

  async function shutdown() {
    stopped = true
    clearAll()
    await waitForIdle()
    clearAll()

    if (activeTimerManager === manager) {
      activeTimerManager = null
    }
  }

  const manager = {
    clearAuction,
    clearAll,
    scheduleAuction,
    schedulePersistedAuctions,
    shutdown,
    waitForIdle,
  }

  activeTimerManager = manager
  return manager
}

export function scheduleAuctionLifecycle(auction) {
  activeTimerManager?.scheduleAuction(auction)
}

export function cancelAuctionLifecycle(auctionId) {
  if (!mongoose.isObjectIdOrHexString(auctionId)) {
    return
  }

  activeTimerManager?.clearAuction(
    new mongoose.Types.ObjectId(auctionId).toString(),
  )
}
