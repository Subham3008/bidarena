import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import app from '../app.js'
import Auction from '../models/auction.model.js'

describe('auction creation API', () => {
  let mongoServer

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough'
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())
  }, 120000)

  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })

  it('rejects unauthenticated auction creation', async () => {
    const response = await request(app).post('/api/auctions').send({
      title: 'Mechanical Keyboard',
      description: 'Hot-swappable keyboard in excellent condition.',
      image: 'https://example.com/keyboard.jpg',
      startBid: 5000,
      minimumIncrement: 250,
      startAt: new Date(Date.now() + 60_000).toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
    })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('creates a valid auction with authenticated seller and server state', async () => {
    const agent = request.agent(app)
    const registration = await agent.post('/api/auth/register').send({
      displayName: 'Subham',
      email: 'subham-auctions@example.com',
      password: 'password123',
    })

    const response = await agent.post('/api/auctions').send({
      title: '  Mechanical Keyboard  ',
      description: 'Hot-swappable keyboard in excellent condition.',
      image: 'https://example.com/keyboard.jpg',
      startBid: 5000,
      minimumIncrement: 250,
      startAt: new Date(Date.now() + 60_000).toISOString(),
      endAt: new Date(Date.now() + 3_600_000).toISOString(),
    })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      success: true,
      message: 'Auction created successfully',
      data: {
        auction: {
          title: 'Mechanical Keyboard',
          currentBid: 5000,
          status: 'UPCOMING',
          bidCount: 0,
          seller: {
            _id: registration.body.data.user.id,
            name: 'Subham',
          },
        },
      },
    })

    const storedAuction = await Auction.findById(response.body.data.auction._id)
    expect(storedAuction).toMatchObject({
      currentBid: 5000,
      currentBidder: null,
      winner: null,
      bidCount: 0,
      sequence: 0,
      paymentStatus: 'PENDING',
    })
  })

  it('returns public auction details with a safe seller summary', async () => {
    const agent = request.agent(app)
    const registration = await agent.post('/api/auth/register').send({
      displayName: 'Public Seller',
      email: 'public-seller@example.com',
      password: 'password123',
    })
    const auction = await Auction.create({
      seller: registration.body.data.user.id,
      title: 'Studio Headphones',
      description: 'Closed-back headphones in excellent condition.',
      image: 'https://example.com/headphones.jpg',
      startBid: 3000,
      minimumIncrement: 200,
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 3_600_000),
      status: 'ACTIVE',
    })

    const response = await request(app).get(`/api/auctions/${auction.id}`)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      message: 'Auction fetched successfully',
      data: {
        auction: {
          _id: auction.id,
          title: 'Studio Headphones',
          currentBid: 3000,
          minimumIncrement: 200,
          seller: {
            _id: registration.body.data.user.id,
            name: 'Public Seller',
          },
        },
      },
    })
    expect(response.body.data.auction.seller.email).toBeUndefined()
  })
})
