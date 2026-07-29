import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { auctionSocket } from '../services/auction-socket.js'

const ACKNOWLEDGEMENT_TIMEOUT = 5000
const MAX_RECENT_BIDS = 20
const MAX_TIMELINE_EVENTS = 50

function createClientBidId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getId(value) {
  if (typeof value === 'string') {
    return value
  }

  return value?.id ?? value?._id ?? null
}

function compareNewestSequence(first, second, sequenceField = 'sequence') {
  const firstSequence = Number(first?.[sequenceField] ?? first?.sequence ?? 0)
  const secondSequence = Number(second?.[sequenceField] ?? second?.sequence ?? 0)

  if (firstSequence !== secondSequence) {
    return secondSequence - firstSequence
  }

  return new Date(second?.timestamp ?? 0) - new Date(first?.timestamp ?? 0)
}

function compareNewestTimeline(first, second) {
  const firstTimestamp = new Date(
    first?.timestamp ?? first?.occurredAt ?? 0,
  ).getTime()
  const secondTimestamp = new Date(
    second?.timestamp ?? second?.occurredAt ?? 0,
  ).getTime()

  if (firstTimestamp !== secondTimestamp) {
    return secondTimestamp - firstTimestamp
  }

  return Number(second?.sequence ?? 0) - Number(first?.sequence ?? 0)
}

function isSameBid(first, second) {
  const firstId = getId(first)
  const secondId = getId(second)

  if (firstId && secondId && firstId === secondId) {
    return true
  }

  const firstSequence = first?.serverSequence ?? first?.sequence
  const secondSequence = second?.serverSequence ?? second?.sequence
  return (
    firstSequence !== undefined &&
    secondSequence !== undefined &&
    firstSequence === secondSequence
  )
}

function normalizeBids(bids = []) {
  const unique = []

  for (const bid of bids) {
    const duplicateIndex = unique.findIndex((current) =>
      isSameBid(current, bid),
    )

    if (duplicateIndex >= 0) {
      unique[duplicateIndex] = { ...unique[duplicateIndex], ...bid }
    } else {
      unique.push(bid)
    }
  }

  return unique
    .sort((first, second) =>
      compareNewestSequence(first, second, 'serverSequence'),
    )
    .slice(0, MAX_RECENT_BIDS)
}

function isSameTimelineEvent(first, second) {
  const firstId = getId(first)
  const secondId = getId(second)

  if (firstId && secondId) {
    return firstId === secondId
  }

  return (
    !firstId &&
    !secondId &&
    first?.sequence !== undefined &&
    first.sequence === second?.sequence
  )
}

function normalizeTimeline(events = []) {
  const unique = []

  for (const event of events) {
    const duplicateIndex = unique.findIndex((current) =>
      isSameTimelineEvent(current, event),
    )

    if (duplicateIndex >= 0) {
      unique[duplicateIndex] = { ...event, ...unique[duplicateIndex] }
    } else {
      unique.push(event)
    }
  }

  return unique
    .sort(compareNewestTimeline)
    .slice(0, MAX_TIMELINE_EVENTS)
}

function addTimelineEvent(timeline, event) {
  return event
    ? normalizeTimeline([event, ...(timeline ?? [])])
    : timeline ?? []
}

function bidTimelineEvent(bid) {
  if (!bid) {
    return null
  }

  return {
    id: `accepted-bid:${getId(bid) ?? bid.serverSequence}`,
    eventType: 'BID_ACCEPTED',
    actor: bid.bidder,
    metadata: {
      amount: bid.amount,
      bidSequence: bid.serverSequence ?? bid.sequence,
    },
    timestamp: bid.timestamp,
  }
}

function newerServerTime(current, next) {
  if (!Number.isFinite(next)) {
    return current
  }

  return Number.isFinite(current) ? Math.max(current, next) : next
}

function eventTimestamp(serverTime) {
  const timestamp = new Date(serverTime)
  return Number.isNaN(timestamp.getTime())
    ? new Date().toISOString()
    : timestamp.toISOString()
}

function isExpiredActiveSnapshot(snapshot) {
  if (snapshot?.auction?.status !== 'ACTIVE') {
    return false
  }

  const serverTime = Number(snapshot.serverTime)
  const endTime = new Date(snapshot.auction.endAt).getTime()
  return (
    Number.isFinite(serverTime) &&
    Number.isFinite(endTime) &&
    serverTime >= endTime
  )
}

function auctionFields(payload) {
  const fields = [
    'status',
    'currentBid',
    'currentBidder',
    'bidCount',
    'sequence',
    'winner',
    'winningAmount',
    'startAt',
    'endAt',
  ]
  const update = { ...(payload.auction ?? {}) }

  for (const field of fields) {
    if (payload[field] !== undefined) {
      update[field] = payload[field]
    }
  }

  return update
}

function applyAuthoritativeState(state, eventType, payload) {
  if (eventType === 'reset') {
    return null
  }

  if (eventType === 'auction_snapshot') {
    return {
      ...payload,
      auction: payload.auction ?? {},
      latestBids: normalizeBids(payload.latestBids),
      timeline: normalizeTimeline(payload.timeline),
    }
  }

  if (!state) {
    return state
  }

  const serverTime = newerServerTime(state.serverTime, payload.serverTime)

  if (eventType === 'presence_updated') {
    return {
      ...state,
      activeBidderCount:
        payload.activeBidderCount ?? state.activeBidderCount,
      spectatorCount: payload.spectatorCount ?? state.spectatorCount,
      serverTime,
    }
  }

  if (eventType === 'timer_sync') {
    const isCompleted = state.auction?.status === 'COMPLETED'
    return {
      ...state,
      serverTime,
      remainingMs: payload.remainingMs ?? state.remainingMs,
      auction: {
        ...state.auction,
        ...(!isCompleted
          ? auctionFields(payload)
          : {
              startAt: payload.startAt ?? state.auction.startAt,
              endAt: payload.endAt ?? state.auction.endAt,
            }),
      },
    }
  }

  if (eventType === 'auction_started') {
    if (state.auction?.status === 'COMPLETED') {
      return { ...state, serverTime }
    }

    const timelineEvent = {
      id: `auction-started:${payload.auctionId}`,
      eventType: 'AUCTION_STARTED',
      timestamp: eventTimestamp(payload.serverTime),
    }
    return {
      ...state,
      serverTime,
      auction: { ...state.auction, ...auctionFields(payload) },
      timeline: addTimelineEvent(state.timeline, timelineEvent),
    }
  }

  if (eventType === 'auction_completed') {
    const timestamp = eventTimestamp(payload.serverTime)
    const completionEvent = {
      id: `auction-completed:${payload.auctionId}`,
      eventType: 'AUCTION_COMPLETED',
      metadata: { finalBid: payload.winningAmount },
      timestamp,
    }
    const winnerEvent = payload.winner
      ? {
          id: `winner:${payload.auctionId}`,
          eventType: 'WINNER_DECLARED',
          actor: payload.winner,
          metadata: { winningBid: payload.winningAmount },
          timestamp,
        }
      : null

    return {
      ...state,
      serverTime,
      auction: { ...state.auction, ...auctionFields(payload) },
      timeline: normalizeTimeline([
        ...(winnerEvent ? [winnerEvent] : []),
        completionEvent,
        ...(state.timeline ?? []),
      ]),
    }
  }

  if (eventType === 'timeline_event_created') {
    return {
      ...state,
      serverTime,
      timeline: addTimelineEvent(
        state.timeline,
        payload.timelineEvent ?? payload.event,
      ),
    }
  }

  if (eventType === 'auction_state_updated') {
    const currentSequence = Number(state.auction?.sequence ?? 0)
    const incomingSequence = Number(payload.sequence ?? currentSequence)

    if (incomingSequence < currentSequence) {
      return { ...state, serverTime }
    }

    const latestBid =
      payload.latestAcceptedBid ?? payload.latestBid ?? payload.latest
    const recentBids =
      payload.latestBids ?? payload.recentBids ?? payload.recent ?? []
    const timelineEvent =
      payload.timelineEvent ?? bidTimelineEvent(latestBid)

    return {
      ...state,
      serverTime,
      auction: { ...state.auction, ...auctionFields(payload) },
      latestBids: normalizeBids([
        ...recentBids,
        ...(latestBid ? [latestBid] : []),
        ...(state.latestBids ?? []),
      ]),
      timeline: normalizeTimeline([
        ...(payload.timeline ?? []),
        ...(timelineEvent ? [timelineEvent] : []),
        ...(state.timeline ?? []),
      ]),
    }
  }

  return state
}

function roomStateReducer(state, action) {
  return applyAuthoritativeState(state, action.type, action.payload ?? {})
}

export function useAuctionRoom({
  auctionId,
  user,
  isRestoringSession,
  enabled,
}) {
  const [snapshot, dispatch] = useReducer(roomStateReducer, null)
  const [connectionState, setConnectionState] = useState('connecting')
  const [roomError, setRoomError] = useState('')
  const [bidError, setBidError] = useState('')
  const [isSubmittingBid, setIsSubmittingBid] = useState(false)
  const activeAuctionRef = useRef(null)
  const bidPendingRef = useRef(false)
  const joinedRef = useRef(false)
  const joiningRef = useRef(false)
  const reconnectingRef = useRef(false)
  const sequenceRef = useRef(null)
  const snapshotPendingRef = useRef(false)
  const completedRef = useRef(false)
  const lastRejectionRef = useRef({ message: '', receivedAt: 0 })
  const userId = user?.id

  const requestSnapshot = useCallback(() => {
    if (
      !auctionSocket.connected ||
      !joinedRef.current ||
      snapshotPendingRef.current ||
      activeAuctionRef.current !== auctionId
    ) {
      return
    }

    snapshotPendingRef.current = true
    auctionSocket
      .timeout(ACKNOWLEDGEMENT_TIMEOUT)
      .emit('request_auction_snapshot', { auctionId }, (error, result) => {
        if (activeAuctionRef.current !== auctionId) {
          return
        }

        if (error || !result?.success) {
          setRoomError(
            result?.message ?? 'Unable to refresh live auction state',
          )
        }

        snapshotPendingRef.current = false
      })
  }, [auctionId])

  useEffect(() => {
    if (!enabled || !auctionId || isRestoringSession) {
      return undefined
    }

    activeAuctionRef.current = auctionId
    joinedRef.current = false
    joiningRef.current = false
    reconnectingRef.current = false
    sequenceRef.current = null
    snapshotPendingRef.current = false
    completedRef.current = false
    dispatch({ type: 'reset' })
    setRoomError('')
    setBidError('')
    setConnectionState('connecting')

    const isCurrentAuction = (payload) =>
      payload?.auctionId === auctionId ||
      payload?.auction?.id === auctionId ||
      payload?.auction?._id === auctionId

    function applyEvent(type, payload) {
      if (isCurrentAuction(payload)) {
        dispatch({ type, payload })
      }
    }

    function handleSnapshot(nextSnapshot) {
      if (!isCurrentAuction(nextSnapshot)) {
        return
      }

      const snapshotSequence = Number(nextSnapshot.auction?.sequence)
      const currentSequence = sequenceRef.current
      const snapshotIsCompleted =
        nextSnapshot.auction?.status === 'COMPLETED'

      joinedRef.current = true

      if (
        (Number.isFinite(snapshotSequence) &&
          Number.isFinite(currentSequence) &&
          snapshotSequence < currentSequence) ||
        (completedRef.current && !snapshotIsCompleted) ||
        isExpiredActiveSnapshot(nextSnapshot)
      ) {
        snapshotPendingRef.current = false
        setConnectionState('reconnecting')
        requestSnapshot()
        return
      }

      sequenceRef.current = Number.isFinite(snapshotSequence)
        ? snapshotSequence
        : null
      completedRef.current = snapshotIsCompleted
      snapshotPendingRef.current = false
      dispatch({ type: 'auction_snapshot', payload: nextSnapshot })
      setRoomError('')
      setConnectionState('connected')
    }

    function handleBidRejected(rejection) {
      if (rejection?.auctionId && rejection.auctionId !== auctionId) {
        return
      }

      if (!bidPendingRef.current || completedRef.current) {
        return
      }

      const message = rejection?.message ?? 'The bid was rejected'
      const receivedAt = Date.now()
      const isDuplicate =
        lastRejectionRef.current.message === message &&
        receivedAt - lastRejectionRef.current.receivedAt < 1000

      lastRejectionRef.current = { message, receivedAt }
      bidPendingRef.current = false
      setIsSubmittingBid(false)
      setBidError(message)

      if (!isDuplicate) {
        requestSnapshot()
      }
    }

    function handleAuthoritativeUpdate(payload) {
      if (!isCurrentAuction(payload)) {
        return
      }

      const incomingSequence = Number(payload.sequence)
      const currentSequence = sequenceRef.current

      if (
        Number.isFinite(incomingSequence) &&
        Number.isFinite(currentSequence)
      ) {
        if (incomingSequence <= currentSequence) {
          return
        }

        if (incomingSequence > currentSequence + 1) {
          setConnectionState('reconnecting')
          requestSnapshot()
          return
        }
      }

      sequenceRef.current = Number.isFinite(incomingSequence)
        ? incomingSequence
        : currentSequence
      dispatch({ type: 'auction_state_updated', payload })
    }

    function handleAuctionCompleted(payload) {
      if (!isCurrentAuction(payload)) {
        return
      }

      bidPendingRef.current = false
      completedRef.current = true
      setIsSubmittingBid(false)
      setBidError('')
      dispatch({ type: 'auction_completed', payload })
    }

    function joinRoom() {
      if (joinedRef.current || joiningRef.current) {
        return
      }

      joiningRef.current = true
      auctionSocket
        .timeout(ACKNOWLEDGEMENT_TIMEOUT)
        .emit(
          'join_auction',
          { auctionId, mode: userId ? 'BIDDER' : 'SPECTATOR' },
          (error, result) => {
            if (activeAuctionRef.current !== auctionId) {
              return
            }

            joiningRef.current = false

            if (error || !result?.success) {
              joinedRef.current = false
              setRoomError(result?.message ?? 'Unable to join the auction room')
              setConnectionState('disconnected')
              return
            }

            joinedRef.current = true

            if (reconnectingRef.current) {
              reconnectingRef.current = false
              requestSnapshot()
            }
          },
        )
    }

    function handleDisconnect() {
      joinedRef.current = false
      joiningRef.current = false
      reconnectingRef.current = true
      setConnectionState('reconnecting')
    }

    function handleConnectError() {
      setConnectionState('reconnecting')
      setRoomError('Live updates are temporarily unavailable')
    }

    function handleReconnectAttempt() {
      reconnectingRef.current = true
      setConnectionState('reconnecting')
    }

    const listeners = {
      auction_started: (payload) => applyEvent('auction_started', payload),
      auction_completed: handleAuctionCompleted,
      timer_sync: (payload) => applyEvent('timer_sync', payload),
      presence_updated: (payload) =>
        applyEvent('presence_updated', payload),
      auction_state_updated: handleAuthoritativeUpdate,
      timeline_event_created: (payload) =>
        applyEvent('timeline_event_created', payload),
    }

    auctionSocket.on('connect', joinRoom)
    auctionSocket.on('disconnect', handleDisconnect)
    auctionSocket.on('connect_error', handleConnectError)
    auctionSocket.on('auction_snapshot', handleSnapshot)
    auctionSocket.on('bid_rejected', handleBidRejected)
    auctionSocket.io.on('reconnect_attempt', handleReconnectAttempt)

    for (const [event, listener] of Object.entries(listeners)) {
      auctionSocket.on(event, listener)
    }

    if (auctionSocket.connected) {
      joinRoom()
    } else {
      auctionSocket.connect()
    }

    return () => {
      if (auctionSocket.connected && joinedRef.current) {
        auctionSocket.emit('leave_auction', { auctionId })
      }

      auctionSocket.off('connect', joinRoom)
      auctionSocket.off('disconnect', handleDisconnect)
      auctionSocket.off('connect_error', handleConnectError)
      auctionSocket.off('auction_snapshot', handleSnapshot)
      auctionSocket.off('bid_rejected', handleBidRejected)
      auctionSocket.io.off('reconnect_attempt', handleReconnectAttempt)

      for (const [event, listener] of Object.entries(listeners)) {
        auctionSocket.off(event, listener)
      }

      auctionSocket.disconnect()
      activeAuctionRef.current = null
      joinedRef.current = false
      joiningRef.current = false
      reconnectingRef.current = false
      sequenceRef.current = null
      snapshotPendingRef.current = false
      completedRef.current = false
      bidPendingRef.current = false
    }
  }, [auctionId, enabled, isRestoringSession, requestSnapshot, userId])

  const submitBid = useCallback(
    (amount) => {
      if (
        bidPendingRef.current ||
        !auctionSocket.connected ||
        !joinedRef.current ||
        !snapshot ||
        snapshot.currentUserRole !== 'BIDDER' ||
        snapshot.auction?.status !== 'ACTIVE'
      ) {
        return
      }

      bidPendingRef.current = true
      setIsSubmittingBid(true)
      setBidError('')

      auctionSocket.timeout(ACKNOWLEDGEMENT_TIMEOUT).emit(
        'place_bid',
        {
          auctionId,
          amount,
          clientBidId: createClientBidId(),
        },
        (error, result) => {
          if (activeAuctionRef.current !== auctionId) {
            return
          }

          bidPendingRef.current = false
          setIsSubmittingBid(false)

          if (completedRef.current) {
            return
          }

          if (error) {
            setBidError(
              'The server did not confirm this bid. Live state has been refreshed.',
            )
            requestSnapshot()
            return
          }

          if (!result?.success) {
            const message = result?.message ?? 'The bid was rejected'
            const receivedAt = Date.now()
            const isDuplicate =
              lastRejectionRef.current.message === message &&
              receivedAt - lastRejectionRef.current.receivedAt < 1000

            lastRejectionRef.current = { message, receivedAt }
            setBidError(message)

            if (!isDuplicate) {
              requestSnapshot()
            }
            return
          }

          // The acknowledgement confirms persistence; only socket state updates the UI.
          requestSnapshot()
        },
      )
    },
    [auctionId, requestSnapshot, snapshot],
  )

  const clearBidError = useCallback(() => setBidError(''), [])

  return {
    snapshot,
    connectionState,
    roomError,
    bidError,
    clearBidError,
    isSubmittingBid,
    isSynced: Boolean(snapshot),
    submitBid,
  }
}
