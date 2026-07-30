// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const socketMocks = vi.hoisted(() => {
  const listeners = new Map()
  const socket = {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event, listener) => listeners.set(event, listener)),
    off: vi.fn((event) => listeners.delete(event)),
    timeout: vi.fn(),
    io: {
      on: vi.fn(),
      off: vi.fn(),
    },
  }

  socket.timeout.mockImplementation(() => socket)

  return { listeners, socket }
})

vi.mock('../services/auction-socket.js', () => ({
  auctionSocket: socketMocks.socket,
}))

import { useAuctionRoom } from './useAuctionRoom.js'

function configureSocket() {
  socketMocks.listeners.clear()
  socketMocks.socket.connected = false
  socketMocks.socket.connect.mockReset()
  socketMocks.socket.disconnect.mockReset()
  socketMocks.socket.emit.mockImplementation((event, _payload, acknowledge) => {
    if (event === 'join_auction') {
      acknowledge?.(null, { success: true })
      return
    }

    if (event === 'send_chat_message') {
      acknowledge?.(null, {
        success: false,
        code: 'AUCTION_COMPLETED_READ_ONLY',
        message: 'Auction ended. Chat is now read-only.',
      })
      return
    }

    acknowledge?.(null, { success: true })
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useAuctionRoom completed-chat rejection', () => {
  it('locks programmatic chat sending after the completed read-only rejection', async () => {
    configureSocket()

    const { result } = renderHook(() =>
      useAuctionRoom({
        auctionId: 'auction-1',
        user: { id: 'bidder-1' },
        isRestoringSession: false,
        enabled: true,
      }),
    )

    await waitFor(() => {
      expect(socketMocks.listeners.get('connect')).toBeTypeOf('function')
    })

    act(() => {
      socketMocks.socket.connected = true
      socketMocks.listeners.get('connect')()
      socketMocks.listeners.get('auction_snapshot')({
        auctionId: 'auction-1',
        serverTime: Date.now(),
        currentUserRole: 'BIDDER',
        auction: {
          id: 'auction-1',
          status: 'ACTIVE',
        },
      })
    })

    await waitFor(() => expect(result.current.isSynced).toBe(true))

    act(() => {
      expect(result.current.sendChatMessage('One last message')).toBe(true)
    })

    await waitFor(() => {
      expect(result.current.isChatReadOnly).toBe(true)
      expect(result.current.chatSendError).toBe(
        'Auction ended. Chat is now read-only.',
      )
    })

    const sentMessageCalls = socketMocks.socket.emit.mock.calls.filter(
      ([event]) => event === 'send_chat_message',
    )

    act(() => {
      expect(result.current.sendChatMessage('Blocked message')).toBe(false)
    })

    expect(
      socketMocks.socket.emit.mock.calls.filter(
        ([event]) => event === 'send_chat_message',
      ),
    ).toHaveLength(sentMessageCalls.length)
  })
})
