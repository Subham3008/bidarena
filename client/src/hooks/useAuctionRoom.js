import { useCallback, useEffect, useRef, useState } from 'react'

import { auctionSocket } from '../services/auction-socket.js'

const ACKNOWLEDGEMENT_TIMEOUT = 5000

function createClientBidId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function useAuctionRoom({
  auctionId,
  user,
  isRestoringSession,
  enabled,
}) {
  const [snapshot, setSnapshot] = useState(null)
  const [connectionState, setConnectionState] = useState('connecting')
  const [roomError, setRoomError] = useState('')
  const [bidError, setBidError] = useState('')
  const [isSubmittingBid, setIsSubmittingBid] = useState(false)
  const activeAuctionRef = useRef(null)
  const bidPendingRef = useRef(false)

  const requestSnapshot = useCallback(() => {
    if (!auctionSocket.connected || activeAuctionRef.current !== auctionId) {
      return
    }

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
      })
  }, [auctionId])

  useEffect(() => {
    if (!enabled || !auctionId || isRestoringSession) {
      return undefined
    }

    activeAuctionRef.current = auctionId
    setSnapshot(null)
    setRoomError('')
    setBidError('')
    setConnectionState('connecting')

    const isCurrentAuction = (payload) =>
      payload?.auctionId === auctionId ||
      payload?.auction?.id === auctionId ||
      payload?.auction?._id === auctionId

    function handleSnapshot(nextSnapshot) {
      if (!isCurrentAuction(nextSnapshot)) {
        return
      }

      setSnapshot(nextSnapshot)
      setRoomError('')
      setConnectionState('connected')
    }

    function handlePresence(update) {
      if (update?.auctionId !== auctionId) {
        return
      }

      setSnapshot((current) =>
        current
          ? {
              ...current,
              activeBidderCount: update.activeBidderCount,
              spectatorCount: update.spectatorCount,
              serverTime: update.serverTime ?? current.serverTime,
            }
          : current,
      )
    }

    function handleAuthoritativeState(update) {
      if (!isCurrentAuction(update)) {
        return
      }

      setSnapshot((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          ...(Array.isArray(update.latestBids)
            ? { latestBids: update.latestBids }
            : {}),
          ...(Array.isArray(update.timeline)
            ? { timeline: update.timeline }
            : {}),
          auction: update.auction
            ? { ...current.auction, ...update.auction }
            : current.auction,
          serverTime: update.serverTime ?? current.serverTime,
        }
      })
    }

    function handleBidRejected(rejection) {
      if (rejection?.auctionId && rejection.auctionId !== auctionId) {
        return
      }

      bidPendingRef.current = false
      setIsSubmittingBid(false)
      setBidError(rejection?.message ?? 'The bid was rejected')
      requestSnapshot()
    }

    function joinRoom() {
      setConnectionState('connected')
      auctionSocket
        .timeout(ACKNOWLEDGEMENT_TIMEOUT)
        .emit(
          'join_auction',
          { auctionId, mode: user ? 'BIDDER' : 'SPECTATOR' },
          (error, result) => {
            if (activeAuctionRef.current !== auctionId) {
              return
            }

            if (error || !result?.success) {
              setRoomError(result?.message ?? 'Unable to join the auction room')
              setConnectionState('disconnected')
            }
          },
        )
    }

    function handleDisconnect() {
      setConnectionState('reconnecting')
    }

    function handleConnectError() {
      setConnectionState('reconnecting')
      setRoomError('Live updates are temporarily unavailable')
    }

    function handleReconnectAttempt() {
      setConnectionState('reconnecting')
    }

    auctionSocket.on('connect', joinRoom)
    auctionSocket.on('disconnect', handleDisconnect)
    auctionSocket.on('connect_error', handleConnectError)
    auctionSocket.on('auction_snapshot', handleSnapshot)
    auctionSocket.on('presence_updated', handlePresence)
    auctionSocket.on('auction_state_updated', handleAuthoritativeState)
    auctionSocket.on('bid_rejected', handleBidRejected)
    auctionSocket.io.on('reconnect_attempt', handleReconnectAttempt)

    if (auctionSocket.connected) {
      joinRoom()
    } else {
      auctionSocket.connect()
    }

    return () => {
      if (auctionSocket.connected) {
        auctionSocket.emit('leave_auction', { auctionId })
      }

      auctionSocket.off('connect', joinRoom)
      auctionSocket.off('disconnect', handleDisconnect)
      auctionSocket.off('connect_error', handleConnectError)
      auctionSocket.off('auction_snapshot', handleSnapshot)
      auctionSocket.off('presence_updated', handlePresence)
      auctionSocket.off('auction_state_updated', handleAuthoritativeState)
      auctionSocket.off('bid_rejected', handleBidRejected)
      auctionSocket.io.off('reconnect_attempt', handleReconnectAttempt)
      auctionSocket.disconnect()
      activeAuctionRef.current = null
      bidPendingRef.current = false
    }
  }, [auctionId, enabled, isRestoringSession, requestSnapshot, user])

  const submitBid = useCallback(
    (amount) => {
      if (
        bidPendingRef.current ||
        !auctionSocket.connected ||
        !snapshot
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

          if (error) {
            setBidError(
              'The server did not confirm this bid. Live state has been refreshed.',
            )
            requestSnapshot()
            return
          }

          if (!result?.success) {
            setBidError(result?.message ?? 'The bid was rejected')
            requestSnapshot()
            return
          }

          requestSnapshot()
        },
      )
    },
    [auctionId, requestSnapshot, snapshot],
  )

  return {
    snapshot,
    connectionState,
    roomError,
    bidError,
    clearBidError: () => setBidError(''),
    isSubmittingBid,
    isSynced: Boolean(snapshot),
    submitBid,
  }
}
