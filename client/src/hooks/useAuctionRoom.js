import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { auctionSocket } from '../services/auction-socket.js'

const ACKNOWLEDGEMENT_TIMEOUT = 5000
const STATS_REFRESH_INTERVAL = 30_000
const MAX_RECENT_BIDS = 20
const MAX_TIMELINE_EVENTS = 50
const MAX_CHAT_MESSAGES = 50
const CHAT_ROLES = new Set(['SELLER', 'BIDDER'])
const HEAT_LEVELS = new Set(['COLD', 'WARM', 'HOT'])
const COMPLETED_CHAT_REJECTION_CODE = 'AUCTION_COMPLETED_READ_ONLY'
const COMPLETED_CHAT_READ_ONLY_MESSAGE =
  'Auction ended. Chat is now read-only.'

export const MAX_CHAT_MESSAGE_LENGTH = 300

function createClientBidId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createClientMessageId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getId(value) {
  if (typeof value === 'string') {
    return value
  }

  return value?.id ?? value?._id ?? null
}

function safeSocketMessage(value, fallback) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 500)
    : fallback
}

function normalizeChatMessage(message) {
  if (!message || typeof message !== 'object') {
    return null
  }

  const text = typeof message.text === 'string' ? message.text : ''

  if (!text.trim()) {
    return null
  }

  const sender =
    message.sender && typeof message.sender === 'object'
      ? message.sender
      : {}
  const senderId = getId(sender)
  const senderName =
    typeof sender.name === 'string'
      ? sender.name.trim()
      : typeof sender.displayName === 'string'
        ? sender.displayName.trim()
        : ''
  const avatarUrl =
    typeof sender.avatarUrl === 'string'
      ? sender.avatarUrl
      : typeof sender.avatar === 'string'
        ? sender.avatar
        : ''

  return {
    id: getId(message),
    auctionId: getId(message.auctionId) ?? message.auctionId ?? null,
    sender: {
      id: senderId,
      name: senderName || 'Participant',
      avatarUrl,
    },
    text,
    clientMessageId:
      typeof message.clientMessageId === 'string'
        ? message.clientMessageId
        : null,
    createdAt: message.createdAt ?? message.timestamp ?? null,
  }
}

function chatMessageKey(message) {
  if (message.id) {
    return `id:${message.id}`
  }

  if (message.clientMessageId) {
    return `client:${message.sender.id ?? 'unknown'}:${message.clientMessageId}`
  }

  return `legacy:${message.sender.id ?? 'unknown'}:${message.createdAt ?? ''}:${message.text}`
}

function isSameChatMessage(first, second) {
  if (first.id && second.id && first.id === second.id) {
    return true
  }

  return Boolean(
    first.clientMessageId &&
      second.clientMessageId &&
      first.clientMessageId === second.clientMessageId &&
      first.sender.id &&
      first.sender.id === second.sender.id,
  ) || (
    !first.id &&
    !second.id &&
    !first.clientMessageId &&
    !second.clientMessageId &&
    chatMessageKey(first) === chatMessageKey(second)
  )
}

function compareOldestChatMessage(first, second) {
  const firstTime = new Date(first.createdAt ?? 0).getTime()
  const secondTime = new Date(second.createdAt ?? 0).getTime()
  const safeFirstTime = Number.isFinite(firstTime) ? firstTime : 0
  const safeSecondTime = Number.isFinite(secondTime) ? secondTime : 0

  if (safeFirstTime !== safeSecondTime) {
    return safeFirstTime - safeSecondTime
  }

  return chatMessageKey(first).localeCompare(chatMessageKey(second))
}

function normalizeChatMessages(messages = [], auctionId) {
  const unique = []

  for (const candidate of messages) {
    const message = normalizeChatMessage(candidate)

    if (
      !message ||
      (message.auctionId && message.auctionId !== auctionId)
    ) {
      continue
    }

    const duplicateIndex = unique.findIndex((known) =>
      isSameChatMessage(known, message),
    )

    if (duplicateIndex >= 0) {
      const known = unique[duplicateIndex]
      unique[duplicateIndex] = {
        ...known,
        ...message,
        sender: { ...known.sender, ...message.sender },
      }
    } else {
      unique.push(message)
    }
  }

  return unique
    .sort(compareOldestChatMessage)
    .slice(-MAX_CHAT_MESSAGES)
}

function safeCount(value) {
  return Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined
}

function safeNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

function safeAuctionStatus(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const status = value.toUpperCase()
  return ['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)
    ? status
    : undefined
}

function safeDateValue(value) {
  if (value === null) {
    return null
  }

  if (
    (typeof value === 'string' || typeof value === 'number') &&
    !Number.isNaN(new Date(value).getTime())
  ) {
    return value
  }

  return undefined
}

function mergeAuctionStats(current, payload) {
  const source =
    payload?.stats && typeof payload.stats === 'object'
      ? payload.stats
      : payload

  if (!source || typeof source !== 'object') {
    return current
  }

  const next = { ...(current ?? {}) }
  const normalized = {
    bidderCount: safeCount(
      source.bidderCount ?? source.activeBidderCount,
    ),
    spectatorCount: safeCount(source.spectatorCount),
    uniqueBidderCount: safeCount(source.uniqueBidderCount),
    bidCount: safeCount(source.bidCount),
    currentBid: safeNonNegativeNumber(source.currentBid),
    bidVelocityPerMinute: safeNonNegativeNumber(
      source.bidVelocityPerMinute ?? source.velocityPerMinute,
    ),
    lastBidAt: safeDateValue(source.lastBidAt),
    status: safeAuctionStatus(source.status),
  }

  for (const [field, value] of Object.entries(normalized)) {
    if (value !== undefined) {
      next[field] = value
    }
  }

  if (Number.isFinite(payload?.serverTime)) {
    next.serverTime = payload.serverTime
  }

  return Object.keys(next).length > 0 ? next : current
}

function snapshotStats(snapshot) {
  const latestBid = normalizeBids(snapshot?.latestBids)[0]

  return {
    stats: {
      bidderCount: snapshot?.activeBidderCount,
      spectatorCount: snapshot?.spectatorCount,
      bidCount: snapshot?.auction?.bidCount,
      currentBid: snapshot?.auction?.currentBid,
      lastBidAt:
        latestBid?.createdAt ?? latestBid?.timestamp,
      status: snapshot?.auction?.status,
    },
    serverTime: snapshot?.serverTime,
  }
}

function mergeAuctionHeat(current, payload) {
  const rawHeat =
    typeof payload?.heat === 'string'
      ? payload.heat.toUpperCase()
      : typeof payload?.level === 'string'
        ? payload.level.toUpperCase()
        : ''

  if (!HEAT_LEVELS.has(rawHeat)) {
    return current
  }

  const next = {
    level: rawHeat,
  }
  const recentBidCount = safeCount(payload.recentBidCount)
  const windowSeconds = safeCount(payload.windowSeconds)

  if (recentBidCount !== undefined) {
    next.recentBidCount = recentBidCount
  } else if (current?.level === rawHeat && current.recentBidCount !== undefined) {
    next.recentBidCount = current.recentBidCount
  }

  if (windowSeconds !== undefined) {
    next.windowSeconds = windowSeconds
  } else if (current?.level === rawHeat && current.windowSeconds !== undefined) {
    next.windowSeconds = current.windowSeconds
  }

  if (Number.isFinite(payload.serverTime)) {
    next.serverTime = payload.serverTime
  }

  return next
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
    'paymentStatus',
  ]
  const update = { ...(payload.auction ?? {}) }

  for (const field of fields) {
    if (payload[field] !== undefined) {
      update[field] = payload[field]
    }
  }

  return update
}

function normalizedPaymentStatus(value) {
  return value === 'PENDING' ||
    value === 'SUCCESSFUL' ||
    value === 'FAILED'
    ? value
    : null
}

function payloadSequence(payload, fallback) {
  return Number(payload.sequence ?? payload.auction?.sequence ?? fallback)
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
    const authoritativeTimelineEvent = payload.timelineEvent
    const authoritativeEventType =
      authoritativeTimelineEvent?.eventType ??
      authoritativeTimelineEvent?.type
    const winnerEvent = authoritativeTimelineEvent ?? (payload.winner
      ? {
          id: `winner:${payload.auctionId}`,
          eventType: 'WINNER_DECLARED',
          actor: payload.winner,
          metadata: { winningBid: payload.winningAmount },
          timestamp,
        }
      : null)

    return {
      ...state,
      serverTime,
      auction: { ...state.auction, ...auctionFields(payload) },
      timeline: normalizeTimeline([
        ...(winnerEvent ? [winnerEvent] : []),
        ...(authoritativeEventType === 'AUCTION_COMPLETED'
          ? []
          : [completionEvent]),
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

  if (eventType === 'payment_status_updated') {
    const currentStatus = normalizedPaymentStatus(
      state.auction?.paymentStatus,
    )
    const incomingStatus = normalizedPaymentStatus(
      payload.paymentStatus,
    )
    const paymentStatus =
      currentStatus === 'SUCCESSFUL'
        ? currentStatus
        : incomingStatus ?? currentStatus

    return {
      ...state,
      serverTime,
      auction: {
        ...state.auction,
        ...(paymentStatus ? { paymentStatus } : {}),
      },
    }
  }

  if (eventType === 'auction_state_updated') {
    const currentSequence = Number(state.auction?.sequence ?? 0)
    const incomingSequence = payloadSequence(payload, currentSequence)

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
  const [roomStateAuctionId, setRoomStateAuctionId] = useState(null)
  const [roomStateUserId, setRoomStateUserId] = useState(null)
  const [snapshot, dispatch] = useReducer(roomStateReducer, null)
  const [connectionState, setConnectionState] = useState('connecting')
  const [roomError, setRoomError] = useState('')
  const [bidError, setBidError] = useState('')
  const [isSubmittingBid, setIsSubmittingBid] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [isChatHistoryLoading, setIsChatHistoryLoading] = useState(true)
  const [chatHistoryError, setChatHistoryError] = useState('')
  const [chatSendError, setChatSendError] = useState('')
  const [isSendingChat, setIsSendingChat] = useState(false)
  const [isChatReadOnly, setIsChatReadOnly] = useState(false)
  const [auctionStats, setAuctionStats] = useState(null)
  const [auctionHeat, setAuctionHeat] = useState(null)
  const [isInsightsLoading, setIsInsightsLoading] = useState(true)
  const [insightsError, setInsightsError] = useState('')
  const activeAuctionRef = useRef(null)
  const bidPendingRef = useRef(false)
  const chatPendingRef = useRef(null)
  const chatReadOnlyRef = useRef(false)
  const chatHistoryPendingRef = useRef(null)
  const chatHistoryVersionRef = useRef(0)
  const statsPendingRef = useRef(null)
  const statsVersionRef = useRef(0)
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

  const requestChatHistory = useCallback(() => {
    if (
      !auctionSocket.connected ||
      !joinedRef.current ||
      chatHistoryPendingRef.current ||
      activeAuctionRef.current !== auctionId
    ) {
      return false
    }

    const requestId = Symbol('chat-history-request')
    const responseVersion = chatHistoryVersionRef.current
    chatHistoryPendingRef.current = requestId
    if (responseVersion === 0) {
      setIsChatHistoryLoading(true)
    }
    auctionSocket
      .timeout(ACKNOWLEDGEMENT_TIMEOUT)
      .emit('request_chat_history', { auctionId }, (error, result) => {
        if (
          activeAuctionRef.current !== auctionId ||
          chatHistoryPendingRef.current !== requestId
        ) {
          return
        }

        chatHistoryPendingRef.current = null
        setIsChatHistoryLoading(false)
        const receivedFreshResponse =
          chatHistoryVersionRef.current > responseVersion

        if (error || !result?.success) {
          if (!receivedFreshResponse) {
            setChatHistoryError(
              safeSocketMessage(
                result?.message,
                'Unable to refresh auction chat history',
              ),
            )
          }
        } else if (!receivedFreshResponse) {
          setChatHistoryError(
            'The server did not return a valid chat history response',
          )
        }
      })

    return true
  }, [auctionId])

  const requestAuctionStats = useCallback(() => {
    if (
      !auctionSocket.connected ||
      !joinedRef.current ||
      statsPendingRef.current ||
      activeAuctionRef.current !== auctionId
    ) {
      return false
    }

    const requestId = Symbol('auction-stats-request')
    const responseVersion = statsVersionRef.current
    statsPendingRef.current = requestId
    if (responseVersion === 0) {
      setIsInsightsLoading(true)
    }
    auctionSocket
      .timeout(ACKNOWLEDGEMENT_TIMEOUT)
      .emit('request_auction_stats', { auctionId }, (error, result) => {
        if (
          activeAuctionRef.current !== auctionId ||
          statsPendingRef.current !== requestId
        ) {
          return
        }

        statsPendingRef.current = null
        setIsInsightsLoading(false)
        const receivedFreshResponse =
          statsVersionRef.current > responseVersion

        if (error || !result?.success) {
          if (!receivedFreshResponse) {
            setInsightsError(
              safeSocketMessage(
                result?.message,
                'Unable to refresh live auction insights',
              ),
            )
          }
        } else if (!receivedFreshResponse) {
          setInsightsError(
            'The server did not return valid live auction statistics',
          )
        }
      })

    return true
  }, [auctionId])

  useEffect(() => {
    if (!enabled || !auctionId || isRestoringSession) {
      return undefined
    }

    activeAuctionRef.current = auctionId
    setRoomStateAuctionId(auctionId)
    setRoomStateUserId(userId ?? null)
    joinedRef.current = false
    joiningRef.current = false
    reconnectingRef.current = false
    sequenceRef.current = null
    snapshotPendingRef.current = false
    completedRef.current = false
    bidPendingRef.current = false
    chatPendingRef.current = null
    chatReadOnlyRef.current = false
    chatHistoryPendingRef.current = null
    chatHistoryVersionRef.current = 0
    statsPendingRef.current = null
    statsVersionRef.current = 0
    dispatch({ type: 'reset' })
    setRoomError('')
    setBidError('')
    setIsSubmittingBid(false)
    setChatMessages([])
    setIsChatHistoryLoading(true)
    setChatHistoryError('')
    setChatSendError('')
    setIsSendingChat(false)
    setIsChatReadOnly(false)
    setAuctionStats(null)
    setAuctionHeat(null)
    setIsInsightsLoading(true)
    setInsightsError('')
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
      setAuctionStats((current) =>
        mergeAuctionStats(current, snapshotStats(nextSnapshot)),
      )
      setRoomError('')
      setConnectionState('connected')
    }

    function handleChatHistory(payload) {
      if (!isCurrentAuction(payload) || !Array.isArray(payload.messages)) {
        return
      }

      chatHistoryVersionRef.current += 1
      setChatMessages((current) =>
        normalizeChatMessages(
          [...payload.messages, ...current],
          auctionId,
        ),
      )
      setIsChatHistoryLoading(false)
      setChatHistoryError('')
    }

    function handleChatMessage(payload) {
      if (!isCurrentAuction(payload) || !payload.chatMessage) {
        return
      }

      if (
        chatPendingRef.current &&
        payload.chatMessage.clientMessageId ===
          chatPendingRef.current &&
        getId(payload.chatMessage.sender) === userId
      ) {
        chatPendingRef.current = null
        setIsSendingChat(false)
      }

      setChatMessages((current) =>
        normalizeChatMessages(
          [...current, payload.chatMessage],
          auctionId,
        ),
      )
    }

    function handleChatRejected(rejection) {
      if (
        activeAuctionRef.current !== auctionId ||
        (rejection?.auctionId && rejection.auctionId !== auctionId)
      ) {
        return
      }

      if (rejection?.code === COMPLETED_CHAT_REJECTION_CODE) {
        chatPendingRef.current = null
        chatReadOnlyRef.current = true
        setIsSendingChat(false)
        setIsChatReadOnly(true)
        setChatSendError(COMPLETED_CHAT_READ_ONLY_MESSAGE)
        return
      }

      if (!chatPendingRef.current) {
        return
      }

      const message = safeSocketMessage(
        rejection?.message,
        'The chat message was not accepted',
      )
      chatPendingRef.current = null
      setIsSendingChat(false)
      setChatSendError(message)
    }

    function handleAuctionStats(payload) {
      if (!isCurrentAuction(payload)) {
        return
      }

      statsVersionRef.current += 1
      setAuctionStats((current) => mergeAuctionStats(current, payload))
      setIsInsightsLoading(false)
      setInsightsError('')
    }

    function handleAuctionHeat(payload) {
      if (!isCurrentAuction(payload)) {
        return
      }

      setAuctionHeat((current) => mergeAuctionHeat(current, payload))
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

      const incomingSequence = payloadSequence(payload, Number.NaN)
      const currentSequence = sequenceRef.current
      const incomingStatus = payload.auction?.status ?? payload.status
      const completesLifecycle =
        incomingStatus === 'COMPLETED' && !completedRef.current

      if (completedRef.current && incomingStatus !== 'COMPLETED') {
        return
      }

      if (
        Number.isFinite(incomingSequence) &&
        Number.isFinite(currentSequence)
      ) {
        if (
          incomingSequence < currentSequence ||
          (incomingSequence === currentSequence && !completesLifecycle)
        ) {
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

      if (incomingStatus === 'COMPLETED') {
        bidPendingRef.current = false
        completedRef.current = true
        setIsSubmittingBid(false)
        setBidError('')
      }

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
              const message = safeSocketMessage(
                result?.message,
                'Unable to join the auction room',
              )
              setRoomError(message)
              setIsChatHistoryLoading(false)
              setChatHistoryError(message)
              setIsInsightsLoading(false)
              setInsightsError(message)
              setConnectionState('disconnected')
              return
            }

            joinedRef.current = true
            requestChatHistory()
            requestAuctionStats()

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
      payment_status_updated: (payload) =>
        applyEvent('payment_status_updated', payload),
      chat_message: handleChatMessage,
      chat_history: handleChatHistory,
      chat_message_rejected: handleChatRejected,
      auction_stats_updated: handleAuctionStats,
      auction_heat_updated: handleAuctionHeat,
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

    const statsRefreshInterval = window.setInterval(() => {
      if (!completedRef.current) {
        requestAuctionStats()
      }
    }, STATS_REFRESH_INTERVAL)

    return () => {
      window.clearInterval(statsRefreshInterval)

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

      activeAuctionRef.current = null
      joinedRef.current = false
      joiningRef.current = false
      reconnectingRef.current = false
      sequenceRef.current = null
      snapshotPendingRef.current = false
      completedRef.current = false
      bidPendingRef.current = false
      chatPendingRef.current = null
      chatHistoryPendingRef.current = null
      chatHistoryVersionRef.current = 0
      statsPendingRef.current = null
      statsVersionRef.current = 0
      auctionSocket.disconnect()
    }
  }, [
    auctionId,
    enabled,
    isRestoringSession,
    requestAuctionStats,
    requestChatHistory,
    requestSnapshot,
    userId,
  ])

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

  const sendChatMessage = useCallback(
    (rawText) => {
      const text =
        typeof rawText === 'string' ? rawText.trim() : ''

      if (
        chatReadOnlyRef.current ||
        snapshot?.auction?.status === 'COMPLETED'
      ) {
        chatReadOnlyRef.current = true
        setIsChatReadOnly(true)
        setChatSendError(COMPLETED_CHAT_READ_ONLY_MESSAGE)
        return false
      }

      if (!text) {
        setChatSendError('Enter a message before sending')
        return false
      }

      if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
        setChatSendError(
          `Messages must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer`,
        )
        return false
      }

      if (
        chatPendingRef.current ||
        !auctionSocket.connected ||
        !joinedRef.current ||
        activeAuctionRef.current !== auctionId ||
        !userId ||
        !snapshot ||
        !CHAT_ROLES.has(snapshot.currentUserRole)
      ) {
        setChatSendError(
          auctionSocket.connected
            ? 'Chat is read-only for your current room role'
            : 'Reconnect to the auction room before sending a message',
        )
        return false
      }

      const clientMessageId = createClientMessageId()
      chatPendingRef.current = clientMessageId
      setIsSendingChat(true)
      setChatSendError('')

      auctionSocket.timeout(ACKNOWLEDGEMENT_TIMEOUT).emit(
        'send_chat_message',
        {
          auctionId,
          text,
          clientMessageId,
        },
        (error, result) => {
          if (
            activeAuctionRef.current !== auctionId ||
            chatPendingRef.current !== clientMessageId
          ) {
            return
          }

          chatPendingRef.current = null
          setIsSendingChat(false)

          if (error) {
            setChatSendError(
              'The server did not confirm this message. Chat history is being refreshed.',
            )
            requestChatHistory()
            return
          }

          if (!result?.success) {
            if (result?.code === COMPLETED_CHAT_REJECTION_CODE) {
              chatReadOnlyRef.current = true
              setIsChatReadOnly(true)
              setChatSendError(COMPLETED_CHAT_READ_ONLY_MESSAGE)
              return
            }

            setChatSendError(
              safeSocketMessage(
                result?.message,
                'The chat message was not accepted',
              ),
            )
          }

          // Only chat_message and chat_history events update the visible log.
        },
      )

      return true
    },
    [auctionId, requestChatHistory, snapshot, userId],
  )

  const clearBidError = useCallback(() => setBidError(''), [])
  const clearChatSendError = useCallback(
    () => setChatSendError(''),
    [],
  )

  const hasCurrentRoomState =
    roomStateAuctionId === auctionId &&
    roomStateUserId === (userId ?? null)
  const currentSnapshot = hasCurrentRoomState ? snapshot : null

  return {
    snapshot: currentSnapshot,
    connectionState: hasCurrentRoomState
      ? connectionState
      : 'connecting',
    roomError: hasCurrentRoomState ? roomError : '',
    bidError: hasCurrentRoomState ? bidError : '',
    clearBidError,
    isSubmittingBid: hasCurrentRoomState ? isSubmittingBid : false,
    isSynced: Boolean(currentSnapshot),
    submitBid,
    chatMessages: hasCurrentRoomState ? chatMessages : [],
    isChatHistoryLoading:
      !hasCurrentRoomState || isChatHistoryLoading,
    chatHistoryError: hasCurrentRoomState ? chatHistoryError : '',
    chatSendError: hasCurrentRoomState ? chatSendError : '',
    clearChatSendError,
    isSendingChat: hasCurrentRoomState ? isSendingChat : false,
    isChatReadOnly: hasCurrentRoomState ? isChatReadOnly : false,
    sendChatMessage,
    requestChatHistory,
    auctionStats: hasCurrentRoomState ? auctionStats : null,
    auctionHeat: hasCurrentRoomState ? auctionHeat : null,
    isInsightsLoading: !hasCurrentRoomState || isInsightsLoading,
    insightsError: hasCurrentRoomState ? insightsError : '',
    requestAuctionStats,
  }
}
