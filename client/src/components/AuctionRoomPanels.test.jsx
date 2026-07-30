// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuctionChatPanel } from './AuctionRoomPanels.jsx'

const baseProps = {
  messages: [
    {
      id: 'message-1',
      sender: { id: 'bidder-2', name: 'Another bidder' },
      text: 'Existing auction chat history stays visible.',
      createdAt: '2026-07-30T10:00:00.000Z',
    },
  ],
  isLoading: false,
  historyError: '',
  sendError: '',
  isSending: false,
  connectionState: 'connected',
  role: 'BIDDER',
  isAuthenticated: true,
  currentUserId: 'bidder-1',
  sellerId: 'seller-1',
  isSelected: true,
  onRetry: vi.fn(),
  onClearSendError: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AuctionChatPanel completed-auction state', () => {
  it('keeps history visible and blocks composer submission after completion', () => {
    const onSend = vi.fn()

    render(
      <AuctionChatPanel
        {...baseProps}
        auctionStatus="COMPLETED"
        onSend={onSend}
      />,
    )

    const textarea = screen.getByRole('textbox', {
      name: 'Message the room',
    })

    expect(
      screen.getByText('Existing auction chat history stays visible.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Auction ended. Chat is now read-only.'),
    ).toBeInTheDocument()
    expect(textarea).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

    fireEvent.submit(textarea.closest('form'))
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('renders the same lock immediately for the completed-chat rejection fallback', () => {
    render(
      <AuctionChatPanel
        {...baseProps}
        auctionStatus="ACTIVE"
        isChatReadOnly
        onSend={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Auction ended. Chat is now read-only.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('preserves Enter-to-send for active auctions', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn(() => true)

    render(
      <AuctionChatPanel
        {...baseProps}
        auctionStatus="ACTIVE"
        onSend={onSend}
      />,
    )

    const textarea = screen.getByRole('textbox', {
      name: 'Message the room',
    })
    await user.type(textarea, 'Ready to bid')
    await user.keyboard('{Enter}')

    expect(onSend).toHaveBeenCalledWith('Ready to bid')
  })
})
