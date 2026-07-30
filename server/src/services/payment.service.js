import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'

import mongoose from 'mongoose'

import {
  createRazorpayClient,
  getRazorpayConfiguration,
  getSafeRazorpayKeyId,
} from '../config/razorpay.js'
import Auction from '../models/auction.model.js'
import Payment from '../models/payment.model.js'
import Timeline from '../models/timeline.model.js'
import { AppError } from '../utils/app-error.js'
import { serializeParticipant } from './auction-payload.service.js'

const paymentQueueTails = new Map()
const CURRENCY = 'INR'
const PAISE_PER_RUPEE = 100
const ORDER_CREATION_LOCK_MS = 5 * 60_000

function enqueuePaymentOperation(auctionId, operation) {
  const previous = paymentQueueTails.get(auctionId) ?? Promise.resolve()
  const result = previous.then(operation)
  const tail = result
    .catch(() => {})
    .finally(() => {
      if (paymentQueueTails.get(auctionId) === tail) {
        paymentQueueTails.delete(auctionId)
      }
    })

  paymentQueueTails.set(auctionId, tail)
  return result
}

function toId(value) {
  return (
    value?._id ??
    (typeof value?.id === 'string' ? value.id : value)
  )?.toString()
}

function idsMatch(left, right) {
  return Boolean(left && right && toId(left) === toId(right))
}

function paymentError(statusCode, code, message) {
  throw new AppError(statusCode, code, message)
}

function normalizeAuctionId(auctionId) {
  if (!mongoose.isObjectIdOrHexString(auctionId)) {
    paymentError(404, 'AUCTION_NOT_FOUND', 'Auction not found')
  }

  return new mongoose.Types.ObjectId(auctionId).toString()
}

function getPaymentAmounts(auction) {
  const winningAmount = auction.winningAmount
  const amount = winningAmount * PAISE_PER_RUPEE

  if (
    !Number.isFinite(winningAmount) ||
    !Number.isSafeInteger(winningAmount) ||
    winningAmount <= 0 ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    paymentError(
      422,
      'INVALID_WINNING_AMOUNT',
      'Auction winning amount is invalid',
    )
  }

  return { winningAmount, amount }
}

function assertWinnerEligibility(
  auction,
  userId,
  { allowSuccessful = false } = {},
) {
  if (!auction) {
    paymentError(404, 'AUCTION_NOT_FOUND', 'Auction not found')
  }

  if (auction.status !== 'COMPLETED') {
    paymentError(
      409,
      'AUCTION_NOT_COMPLETED',
      'Auction is not completed',
    )
  }

  if (!auction.winner) {
    paymentError(
      422,
      'PAYMENT_NOT_ELIGIBLE',
      'Auction has no winner',
    )
  }

  if (idsMatch(auction.seller, userId)) {
    paymentError(
      403,
      'PAYMENT_FORBIDDEN',
      'Auction sellers cannot pay for their own auction',
    )
  }

  if (!idsMatch(auction.winner, userId)) {
    paymentError(
      403,
      'PAYMENT_FORBIDDEN',
      'Only the auction winner can make this payment',
    )
  }

  const amounts = getPaymentAmounts(auction)

  if (!allowSuccessful && auction.paymentStatus === 'SUCCESSFUL') {
    paymentError(
      409,
      'PAYMENT_ALREADY_COMPLETED',
      'Auction payment is already completed',
    )
  }

  return amounts
}

function assertPaymentMatches(payment, auction, amounts) {
  if (
    !idsMatch(payment.winner, auction.winner) ||
    payment.winningAmount !== amounts.winningAmount ||
    payment.amount !== amounts.amount ||
    payment.currency !== CURRENCY
  ) {
    paymentError(
      409,
      'PAYMENT_STATE_CONFLICT',
      'Stored payment does not match the auction',
    )
  }
}

async function loadAuction(auctionId, session) {
  return Auction.findById(auctionId)
    .populate('winner', '_id displayName avatar')
    .session(session ?? null)
}

async function runInTransaction(operation) {
  const session = await mongoose.startSession()
  let result

  try {
    await session.withTransaction(async () => {
      result = await operation(session)
    })
  } finally {
    await session.endSession()
  }

  return result
}

async function claimOrderCreation({
  auction,
  amounts,
  now = new Date(),
}) {
  const token = randomUUID()
  const expiresAt = new Date(now.getTime() + ORDER_CREATION_LOCK_MS)

  try {
    // The unique auction row claims gateway creation before any network call.
    const payment = await Payment.findOneAndUpdate(
      {
        auction: auction.id,
        status: 'PENDING',
        razorpayOrderId: { $exists: false },
        $or: [
          { orderCreationToken: { $exists: false } },
          { orderCreationExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          orderCreationToken: token,
          orderCreationExpiresAt: expiresAt,
        },
        $setOnInsert: {
          winner: toId(auction.winner),
          winningAmount: amounts.winningAmount,
          amount: amounts.amount,
          currency: CURRENCY,
        },
      },
      {
        returnDocument: 'after',
        runValidators: true,
        setDefaultsOnInsert: true,
        upsert: true,
      },
    )

    assertPaymentMatches(payment, auction, amounts)
    return { payment, token }
  } catch (error) {
    if (error?.code !== 11000) {
      throw error
    }

    const payment = await Payment.findOne({ auction: auction.id })

    if (!payment) {
      throw error
    }

    assertPaymentMatches(payment, auction, amounts)

    if (payment.status === 'SUCCESSFUL') {
      paymentError(
        409,
        'PAYMENT_ALREADY_COMPLETED',
        'Auction payment is already completed',
      )
    }

    if (payment.razorpayOrderId) {
      return { payment, token: null }
    }

    paymentError(
      409,
      'PAYMENT_ORDER_IN_PROGRESS',
      'Payment order creation is already in progress',
    )
  }
}

async function releaseOrderCreationClaim(paymentId, token) {
  await Payment.updateOne(
    {
      _id: paymentId,
      orderCreationToken: token,
      razorpayOrderId: { $exists: false },
    },
    {
      $unset: {
        orderCreationToken: '',
        orderCreationExpiresAt: '',
      },
    },
  )
}

function orderReceipt(auctionId) {
  return `auction_${auctionId}`
}

async function findProviderOrder(client, auctionId, amounts) {
  const result = await client.orders.all({
    receipt: orderReceipt(auctionId),
    count: 10,
  })

  return result?.items?.find(
    (order) =>
      typeof order?.id === 'string' &&
      order.amount === amounts.amount &&
      order.currency === CURRENCY,
  )
}

function isDefinitiveProviderRejection(error) {
  return (
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  )
}

function serializeOrder(auction, payment, keyId) {
  return {
    auctionId: toId(auction),
    orderId: payment.razorpayOrderId,
    amount: payment.amount,
    currency: payment.currency,
    keyId,
    auctionTitle: auction.title,
    winner: serializeParticipant(auction.winner),
  }
}

function verifySignature({
  orderId,
  paymentId,
  signature,
  keySecret,
}) {
  const expected = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest()
  const received = Buffer.from(signature, 'hex')

  return (
    received.length === expected.length &&
    timingSafeEqual(expected, received)
  )
}

function apiPaymentStatus(auction, payment) {
  if (
    auction.status !== 'COMPLETED' ||
    !auction.winner ||
    !Number.isSafeInteger(auction.winningAmount) ||
    auction.winningAmount <= 0
  ) {
    return 'NOT_ELIGIBLE'
  }

  if (
    auction.paymentStatus === 'SUCCESSFUL' ||
    payment?.status === 'SUCCESSFUL'
  ) {
    return 'PAID'
  }

  if (
    auction.paymentStatus === 'FAILED' ||
    payment?.status === 'FAILED'
  ) {
    return 'FAILED'
  }

  return 'PENDING'
}

function serializePaymentStatus({
  auction,
  payment,
  viewerRole,
}) {
  const status = apiPaymentStatus(auction, payment)
  const amount = (() => {
    try {
      return getPaymentAmounts(auction).amount
    } catch {
      return null
    }
  })()

  const data = {
    auctionId: toId(auction),
    status,
    paymentStatus: auction.paymentStatus,
    amount,
    currency: CURRENCY,
    auctionTitle: auction.title,
    winner: serializeParticipant(auction.winner),
    verifiedAt: payment?.verifiedAt ?? null,
    canPay: viewerRole === 'WINNER' && status === 'PENDING',
  }

  if (
    viewerRole === 'WINNER' &&
    status === 'PENDING' &&
    payment?.razorpayOrderId
  ) {
    data.orderId = payment.razorpayOrderId
    data.keyId = getSafeRazorpayKeyId()
  }

  return data
}

export async function createPaymentOrder({ auctionId, userId }) {
  const normalizedAuctionId = normalizeAuctionId(auctionId)

  return enqueuePaymentOperation(normalizedAuctionId, async () => {
    const auction = await loadAuction(normalizedAuctionId)
    const amounts = assertWinnerEligibility(auction, userId)
    const existingPayment = await Payment.findOne({
      auction: normalizedAuctionId,
    }).select('+orderCreationToken +orderCreationExpiresAt')

    if (existingPayment) {
      assertPaymentMatches(existingPayment, auction, amounts)

      if (
        existingPayment.status === 'SUCCESSFUL' ||
        auction.paymentStatus === 'SUCCESSFUL'
      ) {
        paymentError(
          409,
          'PAYMENT_ALREADY_COMPLETED',
          'Auction payment is already completed',
        )
      }
    }

    const { client, keyId } = createRazorpayClient()

    if (existingPayment?.razorpayOrderId) {
      return serializeOrder(auction, existingPayment, keyId)
    }

    const claim = await claimOrderCreation({ auction, amounts })

    if (!claim.token) {
      return serializeOrder(auction, claim.payment, keyId)
    }

    let providerOrder

    if (existingPayment) {
      try {
        providerOrder = await findProviderOrder(
          client,
          auction.id,
          amounts,
        )
      } catch {
        paymentError(
          502,
          'PAYMENT_ORDER_CREATION_FAILED',
          'Unable to recover payment order',
        )
      }
    }

    if (!providerOrder) {
      try {
        providerOrder = await client.orders.create({
          amount: amounts.amount,
          currency: CURRENCY,
          receipt: orderReceipt(auction.id),
          notes: { auctionId: auction.id },
        })
      } catch (error) {
        try {
          providerOrder = await findProviderOrder(
            client,
            auction.id,
            amounts,
          )
        } catch {
          providerOrder = null
        }

        if (!providerOrder) {
          if (isDefinitiveProviderRejection(error)) {
            await releaseOrderCreationClaim(
              claim.payment.id,
              claim.token,
            )
          }

          paymentError(
            502,
            'PAYMENT_ORDER_CREATION_FAILED',
            'Unable to create payment order',
          )
        }
      }
    }

    const orderId =
      typeof providerOrder?.id === 'string'
        ? providerOrder.id.trim()
        : ''

    if (
      !orderId ||
      orderId.length > 120 ||
      (providerOrder.amount !== undefined &&
        providerOrder.amount !== amounts.amount) ||
      (providerOrder.currency !== undefined &&
        providerOrder.currency !== CURRENCY)
    ) {
      paymentError(
        502,
        'PAYMENT_ORDER_CREATION_FAILED',
        'Unable to create payment order',
      )
    }

    try {
      const persisted = await runInTransaction(async (session) => {
        const currentAuction = await loadAuction(
          normalizedAuctionId,
          session,
        )
        const currentAmounts = assertWinnerEligibility(
          currentAuction,
          userId,
        )
        let payment = await Payment.findOne({
          auction: normalizedAuctionId,
        })
          .select('+orderCreationToken +orderCreationExpiresAt')
          .session(session)

        if (payment) {
          assertPaymentMatches(
            payment,
            currentAuction,
            currentAmounts,
          )

          if (payment.status === 'SUCCESSFUL') {
            paymentError(
              409,
              'PAYMENT_ALREADY_COMPLETED',
              'Auction payment is already completed',
            )
          }

          if (payment.razorpayOrderId) {
            return { auction: currentAuction, payment }
          }

          if (payment.orderCreationToken !== claim.token) {
            paymentError(
              409,
              'PAYMENT_ORDER_IN_PROGRESS',
              'Payment order creation is already in progress',
            )
          }

          payment.razorpayOrderId = orderId
          payment.status = 'PENDING'
        } else {
          payment = new Payment({
            auction: currentAuction.id,
            winner: toId(currentAuction.winner),
            status: 'PENDING',
            winningAmount: currentAmounts.winningAmount,
            amount: currentAmounts.amount,
            currency: CURRENCY,
            razorpayOrderId: orderId,
          })
        }

        payment.orderCreationToken = undefined
        payment.orderCreationExpiresAt = undefined
        await payment.save({ session })

        const sequencedAuction = await Auction.findOneAndUpdate(
          {
            _id: currentAuction.id,
            status: 'COMPLETED',
            winner: userId,
            paymentStatus: { $ne: 'SUCCESSFUL' },
          },
          { $inc: { timelineSequence: 1 } },
          { returnDocument: 'after', session },
        )

        if (!sequencedAuction) {
          paymentError(
            409,
            'PAYMENT_STATE_CONFLICT',
            'Auction payment state changed',
          )
        }

        await Timeline.create(
          [
            {
              auction: currentAuction.id,
              eventType: 'PAYMENT_ORDER_CREATED',
              actor: userId,
              sequence: sequencedAuction.timelineSequence,
              metadata: {
                amount: currentAmounts.winningAmount,
                currency: CURRENCY,
              },
            },
          ],
          { session },
        )

        return { auction: currentAuction, payment }
      })

      return serializeOrder(persisted.auction, persisted.payment, keyId)
    } catch (error) {
      if (error?.code === 11000) {
        const payment = await Payment.findOne({
          auction: normalizedAuctionId,
        })

        if (payment?.razorpayOrderId) {
          assertPaymentMatches(payment, auction, amounts)
          return serializeOrder(auction, payment, keyId)
        }

        paymentError(
          409,
          'PAYMENT_STATE_CONFLICT',
          'Payment order could not be persisted',
        )
      }

      throw error
    }
  })
}

export async function verifyPayment({
  auctionId,
  userId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  const normalizedAuctionId = normalizeAuctionId(auctionId)

  return enqueuePaymentOperation(normalizedAuctionId, async () => {
    const auction = await loadAuction(normalizedAuctionId)
    const amounts = assertWinnerEligibility(auction, userId, {
      allowSuccessful: true,
    })
    const payment = await Payment.findOne({
      auction: normalizedAuctionId,
    })

    if (!payment?.razorpayOrderId) {
      paymentError(
        409,
        'PAYMENT_ORDER_REQUIRED',
        'Create a payment order before verification',
      )
    }

    assertPaymentMatches(payment, auction, amounts)

    if (payment.razorpayOrderId !== razorpayOrderId) {
      paymentError(
        409,
        'PAYMENT_ORDER_MISMATCH',
        'Payment order does not match',
      )
    }

    const { keySecret } = getRazorpayConfiguration()

    if (
      !verifySignature({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
        keySecret,
      })
    ) {
      paymentError(
        422,
        'INVALID_PAYMENT_SIGNATURE',
        'Payment signature is invalid',
      )
    }

    if (payment.status === 'SUCCESSFUL') {
      if (payment.razorpayPaymentId !== razorpayPaymentId) {
        paymentError(
          409,
          'PAYMENT_ALREADY_COMPLETED',
          'Auction payment is already completed',
        )
      }

      return {
        didTransition: false,
        payment: serializePaymentStatus({
          auction,
          payment,
          viewerRole: 'WINNER',
        }),
      }
    }

    try {
      return await runInTransaction(async (session) => {
        const currentAuction = await loadAuction(
          normalizedAuctionId,
          session,
        )
        const currentAmounts = assertWinnerEligibility(
          currentAuction,
          userId,
          { allowSuccessful: true },
        )
        const currentPayment = await Payment.findOne({
          auction: normalizedAuctionId,
        }).session(session)

        if (!currentPayment) {
          paymentError(
            409,
            'PAYMENT_ORDER_REQUIRED',
            'Create a payment order before verification',
          )
        }

        assertPaymentMatches(
          currentPayment,
          currentAuction,
          currentAmounts,
        )

        if (currentPayment.razorpayOrderId !== razorpayOrderId) {
          paymentError(
            409,
            'PAYMENT_ORDER_MISMATCH',
            'Payment order does not match',
          )
        }

        if (currentPayment.status === 'SUCCESSFUL') {
          if (currentPayment.razorpayPaymentId !== razorpayPaymentId) {
            paymentError(
              409,
              'PAYMENT_ALREADY_COMPLETED',
              'Auction payment is already completed',
            )
          }

          return {
            didTransition: false,
            payment: serializePaymentStatus({
              auction: currentAuction,
              payment: currentPayment,
              viewerRole: 'WINNER',
            }),
          }
        }

        const now = new Date()
        currentPayment.status = 'SUCCESSFUL'
        currentPayment.razorpayPaymentId = razorpayPaymentId
        currentPayment.verifiedAt = now
        currentPayment.paidAmount = currentPayment.amount
        await currentPayment.save({ session })

        const paidAuction = await Auction.findOneAndUpdate(
          {
            _id: currentAuction.id,
            status: 'COMPLETED',
            winner: userId,
            paymentStatus: { $ne: 'SUCCESSFUL' },
          },
          {
            $set: { paymentStatus: 'SUCCESSFUL' },
            $inc: { timelineSequence: 1 },
          },
          { returnDocument: 'after', session },
        )

        if (!paidAuction) {
          paymentError(
            409,
            'PAYMENT_STATE_CONFLICT',
            'Auction payment state changed',
          )
        }

        await Timeline.create(
          [
            {
              auction: currentAuction.id,
              eventType: 'PAYMENT_COMPLETED',
              actor: userId,
              sequence: paidAuction.timelineSequence,
              metadata: {
                amount: currentPayment.winningAmount,
                currency: currentPayment.currency,
              },
              timestamp: now,
            },
          ],
          { session },
        )

        currentAuction.paymentStatus = 'SUCCESSFUL'

        return {
          didTransition: true,
          payment: serializePaymentStatus({
            auction: currentAuction,
            payment: currentPayment,
            viewerRole: 'WINNER',
          }),
        }
      })
    } catch (error) {
      if (error?.code === 11000) {
        paymentError(
          409,
          'PAYMENT_ALREADY_COMPLETED',
          'Payment identifier was already processed',
        )
      }

      throw error
    }
  })
}

export async function getPaymentStatus({ auctionId, userId }) {
  const normalizedAuctionId = normalizeAuctionId(auctionId)
  const auction = await loadAuction(normalizedAuctionId)

  if (!auction) {
    paymentError(404, 'AUCTION_NOT_FOUND', 'Auction not found')
  }

  const isWinner = idsMatch(auction.winner, userId)
  const isSeller = idsMatch(auction.seller, userId)

  if (!isWinner && !isSeller) {
    paymentError(
      403,
      'PAYMENT_STATUS_FORBIDDEN',
      'Payment status is not available to this user',
    )
  }

  const payment = await Payment.findOne({
    auction: normalizedAuctionId,
  })

  return serializePaymentStatus({
    auction,
    payment,
    viewerRole: isSeller ? 'SELLER' : 'WINNER',
  })
}
