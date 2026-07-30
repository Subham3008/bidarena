import { createHmac } from 'node:crypto'

import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import request from 'supertest'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const { createOrderMock } = vi.hoisted(() => ({
  createOrderMock: vi.fn(),
}))

vi.mock('razorpay', () => ({
  default: class MockRazorpay {
    constructor() {
      this.api = { rq: { defaults: {} } }
      this.orders = { create: createOrderMock }
    }
  },
}))

import app from '../app.js'
import Auction from '../models/auction.model.js'
import Payment from '../models/payment.model.js'
import Timeline from '../models/timeline.model.js'
import { User } from '../models/user.model.js'
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
} from '../utils/session.js'

describe('winner Razorpay payments', () => {
  let mongoServer
  let seller
  let winner
  let nonWinner
  let orderNumber

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough'
    process.env.RAZORPAY_KEY_ID = 'rzp_test_paymentkey'
    process.env.RAZORPAY_KEY_SECRET = 'test-payment-secret'
    mongoServer = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    })
    await mongoose.connect(mongoServer.getUri())
    await Promise.all([
      Auction.init(),
      Payment.init(),
      Timeline.init(),
      User.init(),
    ])
  }, 120000)

  beforeEach(async () => {
    orderNumber = 0
    createOrderMock.mockImplementation(async (order) => ({
      id: `order_test_${++orderNumber}`,
      amount: order.amount,
      currency: order.currency,
    }))

    ;[seller, winner, nonWinner] = await User.create([
      {
        displayName: 'Auction Seller',
        email: 'seller@example.com',
        passwordHash: 'stored-password-hash',
      },
      {
        displayName: 'Auction Winner',
        email: 'winner@example.com',
        avatar: 'https://example.com/winner.png',
        passwordHash: 'stored-password-hash',
      },
      {
        displayName: 'Other Bidder',
        email: 'other@example.com',
        passwordHash: 'stored-password-hash',
      },
    ])
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await Promise.all([
      Auction.deleteMany({}),
      Payment.deleteMany({}),
      Timeline.deleteMany({}),
      User.deleteMany({}),
    ])
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer?.stop()
  })

  function authCookie(user) {
    return `${SESSION_COOKIE_NAME}=${createSessionToken(user.id)}`
  }

  function postAs(user, path, body) {
    const call = request(app).post(path).set('Cookie', authCookie(user))
    return body === undefined ? call : call.send(body)
  }

  function getAs(user, path) {
    return request(app).get(path).set('Cookie', authCookie(user))
  }

  async function createCompletedAuction(overrides = {}) {
    return Auction.create({
      seller: seller.id,
      title: 'Vintage Camera',
      description: 'A completed auction',
      image: 'https://example.com/camera.webp',
      startBid: 1000,
      minimumIncrement: 100,
      currentBid: 2500,
      currentBidder: winner.id,
      startAt: new Date(Date.now() - 10_000),
      endAt: new Date(Date.now() - 1_000),
      status: 'COMPLETED',
      winner: winner.id,
      winningAmount: 2500,
      bidCount: 4,
      sequence: 4,
      timelineSequence: 2,
      ...overrides,
    })
  }

  function paymentPath(auctionId) {
    return `/api/payments/auctions/${auctionId}`
  }

  function signatureFor(orderId, paymentId) {
    return createHmac(
      'sha256',
      process.env.RAZORPAY_KEY_SECRET,
    )
      .update(`${orderId}|${paymentId}`)
      .digest('hex')
  }

  async function createOrder(auction) {
    return postAs(winner, `${paymentPath(auction.id)}/order`)
  }

  async function verifyOrder(auction, orderId, paymentId) {
    return postAs(winner, '/api/payments/verify', {
      auctionId: auction.id,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signatureFor(orderId, paymentId),
    })
  }

  it('allows the persisted winner to create a safe payment order', async () => {
    const auction = await createCompletedAuction()
    const response = await createOrder(auction)

    expect(response.status).toBe(201)
    expect(response.body.data.order).toMatchObject({
      auctionId: auction.id,
      orderId: 'order_test_1',
      amount: 250000,
      currency: 'INR',
      keyId: 'rzp_test_paymentkey',
      auctionTitle: 'Vintage Camera',
      winner: {
        id: winner.id,
        name: 'Auction Winner',
      },
    })
    expect(response.body.data.order).not.toHaveProperty('keySecret')
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 250000,
        currency: 'INR',
      }),
    )

    const payment = await Payment.findOne({
      auction: auction.id,
    }).select('+orderCreationToken +orderCreationExpiresAt')
    expect(payment).toMatchObject({
      winner: winner._id,
      winningAmount: 2500,
      amount: 250000,
      status: 'PENDING',
    })
    expect(payment.orderCreationToken).toBeUndefined()
    expect(payment.orderCreationExpiresAt).toBeUndefined()
    expect(
      await Timeline.countDocuments({
        auction: auction.id,
        eventType: 'PAYMENT_ORDER_CREATED',
      }),
    ).toBe(1)

    const reusedResponse = await createOrder(auction)
    expect(reusedResponse.body.data.order.orderId).toBe('order_test_1')
    expect(createOrderMock).toHaveBeenCalledTimes(1)

    const sellerStatus = await getAs(seller, paymentPath(auction.id))
    expect(sellerStatus.status).toBe(200)
    expect(sellerStatus.body.data.payment).not.toHaveProperty('orderId')
    expect(sellerStatus.body.data.payment).not.toHaveProperty('keyId')
  })

  it('rejects seller and non-winner order creation', async () => {
    const auction = await createCompletedAuction()
    const sellerResponse = await postAs(
      seller,
      `${paymentPath(auction.id)}/order`,
    )
    const nonWinnerResponse = await postAs(
      nonWinner,
      `${paymentPath(auction.id)}/order`,
    )

    expect(sellerResponse.status).toBe(403)
    expect(nonWinnerResponse.status).toBe(403)
    expect(createOrderMock).not.toHaveBeenCalled()
  })

  it('uses persisted winningAmount despite client-supplied values', async () => {
    const auction = await createCompletedAuction()
    const response = await postAs(
      winner,
      `${paymentPath(auction.id)}/order`,
      {
        amount: 1,
        winnerId: nonWinner.id,
      },
    )

    expect(response.status).toBe(201)
    expect(response.body.data.order.amount).toBe(250000)
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 250000 }),
    )
  })

  it('marks payment successful after valid signature verification', async () => {
    const auction = await createCompletedAuction()
    const orderResponse = await createOrder(auction)
    const response = await verifyOrder(
      auction,
      orderResponse.body.data.order.orderId,
      'pay_test_valid',
    )

    expect(response.status).toBe(200)
    expect(response.body.data.payment).toMatchObject({
      auctionId: auction.id,
      status: 'PAID',
      paymentStatus: 'SUCCESSFUL',
      amount: 250000,
    })

    const [payment, paidAuction] = await Promise.all([
      Payment.findOne({ auction: auction.id }),
      Auction.findById(auction.id),
    ])
    expect(payment).toMatchObject({
      status: 'SUCCESSFUL',
      razorpayPaymentId: 'pay_test_valid',
      paidAmount: 250000,
    })
    expect(payment.verifiedAt).toBeInstanceOf(Date)
    expect(paidAuction.paymentStatus).toBe('SUCCESSFUL')
    expect(
      await Timeline.countDocuments({
        auction: auction.id,
        eventType: 'PAYMENT_COMPLETED',
      }),
    ).toBe(1)

    const statusResponse = await getAs(winner, paymentPath(auction.id))
    expect(statusResponse.body.data.payment.status).toBe('PAID')
  })

  it('keeps payment pending after an invalid signature', async () => {
    const auction = await createCompletedAuction()
    const orderResponse = await createOrder(auction)
    const response = await postAs(winner, '/api/payments/verify', {
      auctionId: auction.id,
      razorpayOrderId: orderResponse.body.data.order.orderId,
      razorpayPaymentId: 'pay_test_invalid',
      razorpaySignature: '0'.repeat(64),
    })

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('INVALID_PAYMENT_SIGNATURE')
    expect(
      await Payment.findOne({ auction: auction.id }),
    ).toMatchObject({ status: 'PENDING' })
    expect((await Auction.findById(auction.id)).paymentStatus).toBe(
      'PENDING',
    )
    expect(
      await Timeline.countDocuments({
        auction: auction.id,
        eventType: 'PAYMENT_COMPLETED',
      }),
    ).toBe(0)
  })

  it('keeps repeated valid verification idempotent', async () => {
    const auction = await createCompletedAuction()
    const orderResponse = await createOrder(auction)
    const orderId = orderResponse.body.data.order.orderId
    const first = await verifyOrder(auction, orderId, 'pay_test_repeat')
    const second = await verifyOrder(auction, orderId, 'pay_test_repeat')

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.data.payment.status).toBe('PAID')
    expect(await Payment.countDocuments({ auction: auction.id })).toBe(1)
    expect(
      await Timeline.countDocuments({
        auction: auction.id,
        eventType: 'PAYMENT_COMPLETED',
      }),
    ).toBe(1)
  })

  it('does not create another order after successful payment', async () => {
    const auction = await createCompletedAuction()
    const orderResponse = await createOrder(auction)
    const orderId = orderResponse.body.data.order.orderId
    await verifyOrder(auction, orderId, 'pay_test_paid')

    const response = await createOrder(auction)

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('PAYMENT_ALREADY_COMPLETED')
    expect(createOrderMock).toHaveBeenCalledTimes(1)
  })

  it('rejects payment when a completed auction has no winner', async () => {
    const auction = await createCompletedAuction({
      currentBid: 1000,
      currentBidder: null,
      winner: null,
      winningAmount: null,
      bidCount: 0,
    })
    const response = await postAs(
      seller,
      `${paymentPath(auction.id)}/order`,
    )

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('PAYMENT_NOT_ELIGIBLE')
    expect(createOrderMock).not.toHaveBeenCalled()
  })
})
