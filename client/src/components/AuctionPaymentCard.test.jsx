// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuctionPaymentCard } from './AuctionPaymentCard.jsx'

const paymentMocks = vi.hoisted(() => ({
  createPaymentOrder: vi.fn(),
  fetchPaymentStatus: vi.fn(),
  verifyPayment: vi.fn(),
}))
const checkoutMocks = vi.hoisted(() => ({
  loadRazorpayCheckout: vi.fn(),
}))

vi.mock('../services/payments.js', () => paymentMocks)
vi.mock('../services/razorpay-checkout.js', () => checkoutMocks)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AuctionPaymentCard', () => {
  it('keeps a backend-confirmed legacy payment paid', async () => {
    const auctionId = '507f1f77bcf86cd799439011'
    const winnerId = '507f191e810c19729de860ea'
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    paymentMocks.fetchPaymentStatus.mockResolvedValue({
      auctionId,
      status: 'PENDING',
      paymentStatus: 'SUCCESSFUL',
      amount: 125_000,
      currency: 'INR',
      auctionTitle: 'Signed first edition',
      winner: {
        id: winnerId,
        name: 'Winning bidder',
      },
      verifiedAt: null,
      canPay: true,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <AuctionPaymentCard
          auctionId={auctionId}
          auction={{
            _id: auctionId,
            status: 'COMPLETED',
            title: 'Signed first edition',
            seller: { id: '507f191e810c19729de860eb' },
            winner: { id: winnerId },
          }}
          user={{
            id: winnerId,
            displayName: 'Winning bidder',
            email: 'winner@example.com',
          }}
          isRestoringSession={false}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Paid')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Pay securely' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('Verified by the BidArena server'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument()
  })

  it('deduplicates checkout and verifies the exact provider result', async () => {
    const user = userEvent.setup()
    const auctionId = '507f1f77bcf86cd799439011'
    const winnerId = '507f191e810c19729de860ea'
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    const checkoutInstance = {
      close: vi.fn(),
      on: vi.fn(),
      open: vi.fn(),
    }
    let checkoutOptions

    function Razorpay(options) {
      checkoutOptions = options
      return checkoutInstance
    }

    const pendingPayment = {
      auctionId,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      amount: 125_000,
      currency: 'INR',
      auctionTitle: 'Signed first edition',
      winner: {
        id: winnerId,
        name: 'Winning bidder',
      },
      verifiedAt: null,
      canPay: true,
    }

    paymentMocks.fetchPaymentStatus.mockResolvedValue(pendingPayment)
    paymentMocks.createPaymentOrder.mockResolvedValue({
      auctionId,
      orderId: 'order_test_123',
      amount: 125_000,
      currency: 'INR',
      keyId: 'rzp_test_public123',
      auctionTitle: 'Signed first edition',
      winner: {
        id: winnerId,
        name: 'Winning bidder',
      },
    })
    checkoutMocks.loadRazorpayCheckout.mockResolvedValue(Razorpay)
    paymentMocks.verifyPayment.mockResolvedValue({
      ...pendingPayment,
      status: 'PAID',
      paymentStatus: 'SUCCESSFUL',
      verifiedAt: '2026-07-30T09:30:00.000Z',
      canPay: false,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <AuctionPaymentCard
          auctionId={auctionId}
          auction={{
            _id: auctionId,
            status: 'COMPLETED',
            title: 'Signed first edition',
            seller: { id: '507f191e810c19729de860eb' },
            winner: { id: winnerId },
          }}
          user={{
            id: winnerId,
            displayName: 'Winning bidder',
            email: 'winner@example.com',
          }}
          isRestoringSession={false}
        />
      </QueryClientProvider>,
    )

    const payButton = await screen.findByRole('button', {
      name: 'Pay securely',
    })
    await user.dblClick(payButton)

    await waitFor(() => {
      expect(paymentMocks.createPaymentOrder).toHaveBeenCalledTimes(1)
      expect(checkoutMocks.loadRazorpayCheckout).toHaveBeenCalledTimes(1)
      expect(checkoutInstance.open).toHaveBeenCalledTimes(1)
    })
    expect(paymentMocks.createPaymentOrder).toHaveBeenCalledWith(
      auctionId,
      expect.any(AbortSignal),
    )

    await act(async () => {
      checkoutOptions.handler({
        razorpay_order_id: 'order_test_123',
        razorpay_payment_id: 'pay_test_123',
        razorpay_signature: 'a'.repeat(64),
      })
    })

    await waitFor(() => {
      expect(paymentMocks.verifyPayment).toHaveBeenCalledTimes(1)
    })
    expect(paymentMocks.verifyPayment).toHaveBeenCalledWith(
      {
        auctionId,
        razorpayOrderId: 'order_test_123',
        razorpayPaymentId: 'pay_test_123',
        razorpaySignature: 'a'.repeat(64),
      },
      expect.any(AbortSignal),
    )
    expect(await screen.findByText('Paid')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Pay securely' }),
    ).not.toBeInTheDocument()
  })
})
