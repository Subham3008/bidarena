import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  createPaymentOrder,
  fetchPaymentStatus,
  verifyPayment,
} from '../services/payments.js'
import { loadRazorpayCheckout } from '../services/razorpay-checkout.js'
import { formatCurrency } from '../utils/currency.js'

const PAYMENT_STATUSES = new Set([
  'NOT_ELIGIBLE',
  'PENDING',
  'PAID',
  'FAILED',
])
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/
const SIGNATURE_PATTERN = /^[A-Fa-f0-9]{64}$/
const KEY_ID_PATTERN = /^rzp_(?:test|live)_[A-Za-z0-9]+$/

const STATUS_PRESENTATION = {
  NOT_ELIGIBLE: {
    label: 'Not eligible',
    className: 'bg-stone-100 text-stone-700 ring-stone-200',
  },
  PENDING: {
    label: 'Payment pending',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  PAID: {
    label: 'Paid',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  FAILED: {
    label: 'Payment failed',
    className: 'bg-red-50 text-red-800 ring-red-200',
  },
}

const PHASE_MESSAGES = {
  'creating-order': 'Creating a secure payment order…',
  'loading-checkout': 'Loading Razorpay Checkout…',
  'checkout-open': 'Razorpay Checkout is open in a secure dialog.',
  verifying: 'Verifying the payment with BidArena…',
}

function identityId(value) {
  if (typeof value === 'string') {
    return value
  }

  return value?.id ?? value?._id ?? null
}

function safeString(value, maximumLength = 200) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maximumLength)
}

function derivePaymentStatus(payment) {
  if (
    payment?.status === 'PAID' ||
    payment?.paymentStatus === 'SUCCESSFUL'
  ) {
    return 'PAID'
  }

  if (PAYMENT_STATUSES.has(payment?.status)) {
    return payment.status
  }

  if (payment?.paymentStatus === 'FAILED') {
    return 'FAILED'
  }

  if (payment?.paymentStatus === 'PENDING') {
    return 'PENDING'
  }

  return 'NOT_ELIGIBLE'
}

function normalizePaymentStatus(payment, auctionId) {
  const status = derivePaymentStatus(payment)
  const amount =
    Number.isSafeInteger(payment?.amount) && payment.amount > 0
      ? payment.amount
      : null
  const verifiedDate = payment?.verifiedAt
    ? new Date(payment.verifiedAt)
    : null

  return {
    auctionId: safeString(payment?.auctionId) || auctionId,
    status,
    paymentStatus:
      payment?.paymentStatus === 'SUCCESSFUL' ||
      payment?.paymentStatus === 'FAILED' ||
      payment?.paymentStatus === 'PENDING'
        ? payment.paymentStatus
        : null,
    amount,
    currency: safeString(payment?.currency, 8),
    auctionTitle: safeString(payment?.auctionTitle),
    winner: payment?.winner ?? null,
    verifiedAt:
      !verifiedDate || Number.isNaN(verifiedDate.getTime())
      ? null
      : verifiedDate.toISOString(),
    canPay: payment?.canPay === true,
  }
}

function preserveConfirmedPayment(previous, incoming, auctionId) {
  const previousStatus = normalizePaymentStatus(previous, auctionId)
  const incomingStatus = normalizePaymentStatus(incoming, auctionId)

  if (
    previousStatus.status === 'PAID' &&
    incomingStatus.status !== 'PAID'
  ) {
    return {
      ...incoming,
      ...previous,
      status: 'PAID',
      paymentStatus: 'SUCCESSFUL',
      canPay: false,
    }
  }

  return incoming
}

function paymentErrorCode(error) {
  return error?.response?.data?.error?.code ?? ''
}

function isHiddenStatusError(error) {
  const status = error?.response?.status
  const code = paymentErrorCode(error)

  return (
    status === 401 ||
    status === 403 ||
    code === 'UNAUTHENTICATED' ||
    code === 'PAYMENT_STATUS_FORBIDDEN'
  )
}

function shouldRetryStatus(failureCount, error) {
  const status = error?.response?.status

  return (
    error?.message !== 'INVALID_PAYMENT_STATUS_RESPONSE' &&
    failureCount < 1 &&
    (!status || status >= 500)
  )
}

function isCancelledRequest(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError'
}

function isRetryableVerification(error) {
  const status = error?.response?.status
  return !status || status === 408 || status === 429 || status >= 500
}

function safePaymentError(error, context) {
  const code = paymentErrorCode(error)

  if (!error?.response) {
    return 'The payment service could not be reached. Check your connection and try again.'
  }

  const messages = {
    PAYMENT_CONFIGURATION_ERROR:
      'Razorpay test payments are not configured on the server.',
    PAYMENT_ALREADY_COMPLETED:
      'This auction has already been paid. Refreshing its status now.',
    PAYMENT_ORDER_IN_PROGRESS:
      'A secure order is already being prepared. Wait a moment, then try again.',
    PAYMENT_ORDER_CREATION_FAILED:
      'Razorpay could not create a secure order. No payment was started.',
    PAYMENT_NOT_ELIGIBLE:
      'This auction is not eligible for winner payment.',
    INVALID_WINNING_AMOUNT:
      'The saved winning amount cannot be used for checkout.',
    PAYMENT_FORBIDDEN:
      'Only the persisted auction winner can start this payment.',
    AUCTION_NOT_COMPLETED:
      'Payment becomes available only after the auction is completed.',
    INVALID_PAYMENT_SIGNATURE:
      'The payment response could not be verified. Payment has not been marked as paid.',
    PAYMENT_ORDER_MISMATCH:
      'The payment response does not match this auction order.',
    PAYMENT_ORDER_REQUIRED:
      'The secure order could not be found. Refresh the payment status before retrying.',
    PAYMENT_STATE_CONFLICT:
      'Payment state changed while this request was processed. Refresh and try again.',
  }

  return (
    messages[code] ??
    (context === 'status'
      ? 'Payment status is temporarily unavailable.'
      : context === 'verify'
        ? 'BidArena could not verify this payment.'
        : 'A secure payment order could not be created.')
  )
}

function validateOrder(order, { auctionId, payment, userId }) {
  const orderAuctionId = safeString(order?.auctionId)
  const orderId = safeString(order?.orderId, 120)
  const keyId = safeString(order?.keyId, 120)
  const currency = safeString(order?.currency, 8)
  const winnerId = identityId(order?.winner)

  if (
    orderAuctionId !== auctionId ||
    !PROVIDER_ID_PATTERN.test(orderId) ||
    !KEY_ID_PATTERN.test(keyId) ||
    !Number.isSafeInteger(order?.amount) ||
    order.amount <= 0 ||
    order.amount !== payment.amount ||
    currency !== payment.currency ||
    currency !== 'INR' ||
    winnerId !== userId
  ) {
    throw new Error('INVALID_ORDER_RESPONSE')
  }

  return {
    auctionId: orderAuctionId,
    orderId,
    keyId,
    amount: order.amount,
    currency,
    auctionTitle:
      safeString(order?.auctionTitle) ||
      payment.auctionTitle ||
      'Auction winner payment',
  }
}

function verificationPayload(result, auctionId) {
  const razorpayOrderId = safeString(result?.razorpay_order_id, 120)
  const razorpayPaymentId = safeString(
    result?.razorpay_payment_id,
    120,
  )
  const razorpaySignature = safeString(
    result?.razorpay_signature,
    64,
  )

  if (
    !PROVIDER_ID_PATTERN.test(razorpayOrderId) ||
    !PROVIDER_ID_PATTERN.test(razorpayPaymentId) ||
    !SIGNATURE_PATTERN.test(razorpaySignature)
  ) {
    return null
  }

  return {
    auctionId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  }
}

function formatVerifiedAt(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

export function AuctionPaymentCard({
  auctionId,
  auction,
  user,
  isRestoringSession,
  socketPaymentStatus,
}) {
  const queryClient = useQueryClient()
  const payButtonRef = useRef(null)
  const mountedRef = useRef(false)
  const operationRef = useRef(false)
  const operationTokenRef = useRef(null)
  const orderControllerRef = useRef(null)
  const verificationControllerRef = useRef(null)
  const verificationInFlightRef = useRef(false)
  const verificationPayloadRef = useRef(null)
  const checkoutInstanceRef = useRef(null)
  const checkoutResolvedRef = useRef(false)
  const [checkoutState, setCheckoutState] = useState({
    phase: 'idle',
    error: '',
    notice: '',
    isTestMode: false,
    canRetryVerification: false,
  })

  const userId = identityId(user)
  const sellerId = identityId(auction?.seller)
  const liveWinnerId = identityId(auction?.winner)
  const isCompleted = auction?.status === 'COMPLETED'
  const isLikelyViewer = userId === sellerId || userId === liveWinnerId
  const queryEnabled = Boolean(
    auctionId &&
      userId &&
      isCompleted &&
      !isRestoringSession,
  )
  const paymentQueryKey = useMemo(
    () => ['auction-payment', auctionId, userId],
    [auctionId, userId],
  )

  const paymentQuery = useQuery({
    queryKey: paymentQueryKey,
    queryFn: async ({ signal }) => {
      const payment = await fetchPaymentStatus(auctionId, signal)

      if (safeString(payment?.auctionId) !== auctionId) {
        throw new Error('INVALID_PAYMENT_STATUS_RESPONSE')
      }

      return preserveConfirmedPayment(
        queryClient.getQueryData(paymentQueryKey),
        payment,
        auctionId,
      )
    },
    enabled: queryEnabled,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: shouldRetryStatus,
  })

  const payment = useMemo(
    () => normalizePaymentStatus(paymentQuery.data, auctionId),
    [auctionId, paymentQuery.data],
  )
  const backendWinnerId = identityId(payment.winner)
  const isBackendWinner = Boolean(
    backendWinnerId && backendWinnerId === userId,
  )
  const hasValidAmount =
    payment.amount !== null && payment.currency === 'INR'
  const canCheckout =
    Boolean(paymentQuery.data) &&
    isCompleted &&
    socketPaymentStatus !== 'SUCCESSFUL' &&
    payment.status === 'PENDING' &&
    payment.canPay &&
    isBackendWinner &&
    hasValidAmount
  const isBusy =
    payment.status !== 'PAID' &&
    [
      'creating-order',
      'loading-checkout',
      'checkout-open',
      'verifying',
    ].includes(checkoutState.phase)
  const verifiedAt = formatVerifiedAt(payment.verifiedAt)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      operationTokenRef.current = null
      operationRef.current = false
      verificationInFlightRef.current = false
      verificationPayloadRef.current = null
      checkoutResolvedRef.current = true
      orderControllerRef.current?.abort()
      verificationControllerRef.current?.abort()
      checkoutInstanceRef.current?.close?.()
      checkoutInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (
      socketPaymentStatus === 'SUCCESSFUL' &&
      queryEnabled &&
      payment.status !== 'PAID'
    ) {
      queryClient.setQueryData(paymentQueryKey, (current) =>
        current
          ? {
              ...current,
              status: 'PAID',
              paymentStatus: 'SUCCESSFUL',
              canPay: false,
            }
          : current,
      )
      queryClient.invalidateQueries({ queryKey: paymentQueryKey })
    }
  }, [
    payment.status,
    paymentQueryKey,
    queryClient,
    queryEnabled,
    socketPaymentStatus,
  ])

  useEffect(() => {
    if (payment.status !== 'PAID') {
      return
    }

    checkoutResolvedRef.current = true
    operationRef.current = false
    verificationPayloadRef.current = null
    checkoutInstanceRef.current?.close?.()
    checkoutInstanceRef.current = null
  }, [payment.status])

  function updateCheckoutState(update) {
    if (mountedRef.current) {
      setCheckoutState((current) => ({ ...current, ...update }))
    }
  }

  function focusPayButton() {
    window.setTimeout(() => payButtonRef.current?.focus(), 0)
  }

  async function refreshAfterVerification() {
    const result = await paymentQuery.refetch()
    const refreshed = normalizePaymentStatus(result.data, auctionId)
    return refreshed.status === 'PAID'
  }

  async function runVerification(payload) {
    if (
      verificationInFlightRef.current ||
      normalizePaymentStatus(
        queryClient.getQueryData(paymentQueryKey),
        auctionId,
      ).status === 'PAID'
    ) {
      return
    }

    const operationToken = Symbol('payment-verification')
    const controller = new AbortController()
    operationTokenRef.current = operationToken
    verificationControllerRef.current?.abort()
    verificationControllerRef.current = controller
    verificationInFlightRef.current = true
    operationRef.current = true
    verificationPayloadRef.current = payload
    updateCheckoutState({
      phase: 'verifying',
      error: '',
      notice: '',
      canRetryVerification: false,
    })

    try {
      const verifiedPayment = await verifyPayment(
        {
          auctionId: payload.auctionId,
          razorpayOrderId: payload.razorpayOrderId,
          razorpayPaymentId: payload.razorpayPaymentId,
          razorpaySignature: payload.razorpaySignature,
        },
        controller.signal,
      )

      if (
        !mountedRef.current ||
        operationTokenRef.current !== operationToken
      ) {
        return
      }

      const verified = normalizePaymentStatus(
        verifiedPayment,
        auctionId,
      )

      if (
        verified.status !== 'PAID' ||
        verified.paymentStatus !== 'SUCCESSFUL'
      ) {
        throw new Error('UNCONFIRMED_VERIFICATION')
      }

      queryClient.setQueryData(paymentQueryKey, verifiedPayment)
      verificationPayloadRef.current = null
      operationRef.current = false
      updateCheckoutState({
        phase: 'idle',
        error: '',
        notice: 'Payment verified successfully.',
        canRetryVerification: false,
      })
      await queryClient.invalidateQueries({ queryKey: paymentQueryKey })
    } catch (error) {
      if (
        isCancelledRequest(error) ||
        !mountedRef.current ||
        operationTokenRef.current !== operationToken
      ) {
        return
      }

      let recoveredAsPaid = false

      try {
        recoveredAsPaid = await refreshAfterVerification()
      } catch {
        recoveredAsPaid = false
      }

      if (!mountedRef.current) {
        return
      }

      if (recoveredAsPaid) {
        verificationPayloadRef.current = null
        operationRef.current = false
        updateCheckoutState({
          phase: 'idle',
          error: '',
          notice: 'Payment verified successfully.',
          canRetryVerification: false,
        })
        return
      }

      const canRetry = isRetryableVerification(error)

      if (!canRetry) {
        verificationPayloadRef.current = null
      }

      operationRef.current = false
      updateCheckoutState({
        phase: 'verification-failed',
        error:
          error.message === 'UNCONFIRMED_VERIFICATION'
            ? 'The server did not confirm this payment as paid.'
            : safePaymentError(error, 'verify'),
        notice: '',
        canRetryVerification: canRetry,
      })
    } finally {
      if (operationTokenRef.current === operationToken) {
        verificationInFlightRef.current = false
        verificationControllerRef.current = null
      }
    }
  }

  function handleCheckoutResult(result) {
    if (checkoutResolvedRef.current) {
      return
    }

    checkoutResolvedRef.current = true
    checkoutInstanceRef.current = null
    const payload = verificationPayload(result, auctionId)

    if (!payload) {
      operationRef.current = false
      updateCheckoutState({
        phase: 'verification-failed',
        error:
          'Razorpay returned an incomplete response. Payment has not been marked as paid.',
        notice: '',
        canRetryVerification: false,
      })
      focusPayButton()
      return
    }

    void runVerification(payload)
  }

  function handleCheckoutDismissed() {
    if (checkoutResolvedRef.current || !mountedRef.current) {
      return
    }

    checkoutResolvedRef.current = true
    checkoutInstanceRef.current = null
    operationRef.current = false
    updateCheckoutState({
      phase: 'dismissed',
      error: '',
      notice: 'Checkout was closed. No payment was confirmed.',
      canRetryVerification: false,
    })
    focusPayButton()
  }

  function handleGatewayFailure() {
    if (checkoutResolvedRef.current || !mountedRef.current) {
      return
    }

    checkoutResolvedRef.current = true
    checkoutInstanceRef.current?.close?.()
    checkoutInstanceRef.current = null
    operationRef.current = false
    updateCheckoutState({
      phase: 'gateway-failed',
      error:
        'Razorpay could not complete the payment. No success has been recorded.',
      notice: '',
      canRetryVerification: false,
    })
    focusPayButton()
  }

  async function handlePay() {
    if (!canCheckout || isBusy || operationRef.current) {
      return
    }

    const operationToken = Symbol('payment-checkout')
    const controller = new AbortController()
    operationTokenRef.current = operationToken
    orderControllerRef.current?.abort()
    orderControllerRef.current = controller
    operationRef.current = true
    checkoutResolvedRef.current = false
    verificationPayloadRef.current = null
    updateCheckoutState({
      phase: 'creating-order',
      error: '',
      notice: '',
      canRetryVerification: false,
    })

    try {
      const rawOrder = await createPaymentOrder(
        auctionId,
        controller.signal,
      )

      if (
        !mountedRef.current ||
        operationTokenRef.current !== operationToken
      ) {
        return
      }

      const cachedPayment = normalizePaymentStatus(
        queryClient.getQueryData(paymentQueryKey),
        auctionId,
      )

      if (cachedPayment.status === 'PAID') {
        operationRef.current = false
        updateCheckoutState({
          phase: 'idle',
          error: '',
          notice: 'This payment is already complete.',
          canRetryVerification: false,
        })
        return
      }

      const order = validateOrder(rawOrder, {
        auctionId,
        payment,
        userId,
      })
      const isTestMode = order.keyId.startsWith('rzp_test_')
      updateCheckoutState({
        phase: 'loading-checkout',
        isTestMode,
      })

      const Razorpay = await loadRazorpayCheckout()

      if (
        !mountedRef.current ||
        operationTokenRef.current !== operationToken
      ) {
        return
      }

      const checkout = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'BidArena',
        description: order.auctionTitle,
        prefill: {
          name: safeString(user?.displayName, 120),
          email: safeString(user?.email, 254),
        },
        theme: {
          color: '#047857',
        },
        retry: {
          enabled: false,
        },
        modal: {
          escape: true,
          ondismiss: handleCheckoutDismissed,
        },
        handler: handleCheckoutResult,
      })

      checkout.on('payment.failed', handleGatewayFailure)
      checkoutInstanceRef.current = checkout
      updateCheckoutState({ phase: 'checkout-open' })
      checkout.open()
    } catch (error) {
      if (
        isCancelledRequest(error) ||
        !mountedRef.current ||
        operationTokenRef.current !== operationToken
      ) {
        return
      }

      operationRef.current = false
      const code = paymentErrorCode(error)

      if (code === 'PAYMENT_ALREADY_COMPLETED') {
        updateCheckoutState({
          phase: 'idle',
          error: '',
          notice: safePaymentError(error, 'order'),
          canRetryVerification: false,
        })
        await paymentQuery.refetch()
        return
      }

      checkoutResolvedRef.current = true
      checkoutInstanceRef.current?.close?.()
      checkoutInstanceRef.current = null
      updateCheckoutState({
        phase:
          code === 'PAYMENT_CONFIGURATION_ERROR'
            ? 'configuration-unavailable'
            : 'order-failed',
        error:
          error.message === 'INVALID_ORDER_RESPONSE'
            ? 'The server returned an invalid payment order. Checkout was not opened.'
            : error.message?.startsWith('Razorpay Checkout')
              ? 'Razorpay Checkout is unavailable. Check your connection and try again.'
              : safePaymentError(error, 'order'),
        notice: '',
        canRetryVerification: false,
      })
      focusPayButton()
    } finally {
      if (operationTokenRef.current === operationToken) {
        orderControllerRef.current = null
      }
    }
  }

  function handleVerificationRetry() {
    const payload = verificationPayloadRef.current

    if (payload && !operationRef.current) {
      void runVerification(payload)
    }
  }

  if (!queryEnabled) {
    return null
  }

  if (isHiddenStatusError(paymentQuery.error)) {
    return null
  }

  if (
    !paymentQuery.data &&
    !isLikelyViewer &&
    (paymentQuery.isPending || paymentQuery.isError)
  ) {
    return null
  }

  const statusPresentation = paymentQuery.isPending
    ? {
        label: 'Checking eligibility',
        className: 'bg-stone-100 text-stone-700 ring-stone-200',
      }
    : checkoutState.phase === 'configuration-unavailable'
      ? {
          label: 'Configuration unavailable',
          className: 'bg-red-50 text-red-800 ring-red-200',
        }
      : payment.status === 'PENDING' && canCheckout
        ? {
            label: 'Ready to pay',
            className: 'bg-amber-50 text-amber-800 ring-amber-200',
          }
        : STATUS_PRESENTATION[payment.status]
  const auctionTitle =
    payment.auctionTitle || safeString(auction?.title) || 'Completed auction'
  const phaseMessage =
    payment.status === 'PAID'
      ? 'Payment is confirmed by BidArena.'
      : PHASE_MESSAGES[checkoutState.phase] ?? checkoutState.notice

  return (
    <section
      className="mt-4 min-w-0 border border-stone-200 bg-stone-50 p-4 sm:p-5"
      aria-labelledby="auction-payment-title"
      aria-busy={paymentQuery.isPending || isBusy}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center bg-emerald-100 text-emerald-800">
            <CreditCard size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2
              id="auction-payment-title"
              className="font-semibold text-stone-950"
            >
              Winner payment
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Authorised and verified by BidArena
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusPresentation.className}`}
        >
          {statusPresentation.label}
        </span>
      </div>

      {paymentQuery.isPending ? (
        <div
          className="mt-5 flex items-center gap-2 text-sm text-stone-600"
          role="status"
        >
          <LoaderCircle
            size={17}
            className="animate-spin"
            aria-hidden="true"
          />
          Checking authoritative payment status…
        </div>
      ) : paymentQuery.isError && !paymentQuery.data ? (
        <div className="mt-5">
          <p className="text-sm text-red-800" role="alert">
            {safePaymentError(paymentQuery.error, 'status')}
          </p>
          <button
            type="button"
            onClick={() => paymentQuery.refetch()}
            className="mt-3 inline-flex items-center gap-2 rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
          >
            <RefreshCw size={15} aria-hidden="true" />
            Retry status
          </button>
        </div>
      ) : (
        <>
          <dl className="mt-5 grid min-w-0 gap-4 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Auction
              </dt>
              <dd className="mt-1 break-words font-medium text-stone-900">
                {auctionTitle}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Winning amount
              </dt>
              <dd
                className="mt-1 break-words font-semibold tabular-nums text-stone-950"
                title={
                  hasValidAmount
                    ? formatCurrency(payment.amount / 100)
                    : undefined
                }
              >
                {hasValidAmount
                  ? formatCurrency(payment.amount / 100)
                  : 'Unavailable'}
              </dd>
            </div>
          </dl>

          {payment.status === 'PAID' ? (
            <div className="mt-5 border-l-2 border-emerald-700 pl-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <CheckCircle2 size={17} aria-hidden="true" />
                Payment verified
              </p>
              {verifiedAt ? (
                <p className="mt-1 text-xs text-stone-600">
                  Verified {verifiedAt}
                </p>
              ) : (
                <p className="mt-1 text-xs text-stone-600">
                  Verified by the BidArena server
                </p>
              )}
            </div>
          ) : null}

          {payment.status === 'PENDING' && !isBackendWinner ? (
            <p className="mt-5 text-sm text-stone-600">
              The winner has not completed payment yet. Checkout controls
              are available only to the persisted winner.
            </p>
          ) : null}

          {payment.status === 'PENDING' &&
          isBackendWinner &&
          !hasValidAmount ? (
            <p className="mt-5 text-sm text-red-800" role="alert">
              The authoritative winning amount is unavailable, so checkout
              cannot be opened.
            </p>
          ) : null}

          {payment.status === 'NOT_ELIGIBLE' ? (
            <p className="mt-5 text-sm text-stone-600">
              This completed auction does not currently qualify for winner
              payment.
            </p>
          ) : null}

          {payment.status === 'FAILED' ? (
            <p className="mt-5 text-sm text-red-800" role="alert">
              The server records this payment as failed. Refresh the status
              before taking another action.
            </p>
          ) : null}

          {checkoutState.isTestMode && payment.status !== 'PAID' ? (
            <p className="mt-4 flex items-start gap-2 text-xs text-stone-600">
              <ShieldCheck
                size={15}
                className="mt-0.5 shrink-0 text-emerald-800"
                aria-hidden="true"
              />
              Razorpay test mode is active. Do not enter real card or
              banking details.
            </p>
          ) : null}

          {checkoutState.error ? (
            <p
              className="mt-4 break-words text-sm text-red-800"
              role="alert"
            >
              {checkoutState.error}
            </p>
          ) : null}

          <p
            className="mt-4 min-h-5 break-words text-sm text-stone-600"
            aria-live="polite"
            aria-atomic="true"
          >
            {phaseMessage}
            {paymentQuery.isFetching && !paymentQuery.isPending
              ? ' Refreshing payment status…'
              : ''}
          </p>

          {canCheckout ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                ref={payButtonRef}
                type="button"
                onClick={handlePay}
                disabled={isBusy || checkoutState.canRetryVerification}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400 sm:w-auto"
              >
                {isBusy ? (
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldCheck size={16} aria-hidden="true" />
                )}
                {checkoutState.phase === 'creating-order'
                  ? 'Creating order…'
                  : checkoutState.phase === 'loading-checkout'
                    ? 'Loading checkout…'
                    : checkoutState.phase === 'checkout-open'
                      ? 'Checkout open'
                      : checkoutState.phase === 'verifying'
                        ? 'Verifying…'
                        : 'Pay securely'}
              </button>

              {checkoutState.canRetryVerification ? (
                <button
                  type="button"
                  onClick={handleVerificationRetry}
                  disabled={isBusy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-emerald-800 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-500 sm:w-auto"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                  Retry verification
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
