import { v2 as cloudinary } from 'cloudinary'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import app from '../app.js'
import { User } from '../models/user.model.js'

describe('auction image upload API', () => {
  let mongoServer

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough'
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'
    process.env.CLOUDINARY_API_KEY = 'test-key'
    process.env.CLOUDINARY_API_SECRET = 'test-secret'
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())
  }, 120000)

  afterEach(async () => {
    vi.restoreAllMocks()
    await User.deleteMany({})
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })

  async function authenticatedAgent(email) {
    const agent = request.agent(app)
    await agent.post('/api/auth/register').send({
      displayName: 'Image Seller',
      email,
      password: 'password123',
    })
    return agent
  }

  it('uploads a valid image and returns only its Cloudinary reference', async () => {
    const agent = await authenticatedAgent('upload@example.com')
    const uploadStream = vi
      .spyOn(cloudinary.uploader, 'upload_stream')
      .mockImplementation((options, callback) => ({
        end() {
          callback(null, {
            secure_url: 'https://res.cloudinary.com/test/auction.png',
            public_id: 'bidarena/auctions/auction-1',
          })
        },
      }))
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])

    const response = await agent
      .post('/api/uploads/auction-image')
      .attach('image', png, {
        filename: 'auction.png',
        contentType: 'image/png',
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      success: true,
      data: {
        url: 'https://res.cloudinary.com/test/auction.png',
        publicId: 'bidarena/auctions/auction-1',
      },
    })
    expect(uploadStream.mock.calls[0][0]).toMatchObject({
      folder: 'bidarena/auctions',
      resource_type: 'image',
    })
  })

  it('rejects invalid file types and files larger than 5 MB', async () => {
    const agent = await authenticatedAgent('invalid-upload@example.com')
    const uploadStream = vi.spyOn(
      cloudinary.uploader,
      'upload_stream',
    )

    const invalidType = await agent
      .post('/api/uploads/auction-image')
      .attach('image', Buffer.from('plain text'), {
        filename: 'auction.txt',
        contentType: 'text/plain',
      })
    const oversizedJpeg = Buffer.alloc(5 * 1024 * 1024 + 1)
    oversizedJpeg.set([0xff, 0xd8, 0xff])
    const oversized = await agent
      .post('/api/uploads/auction-image')
      .attach('image', oversizedJpeg, {
        filename: 'auction.jpg',
        contentType: 'image/jpeg',
      })

    expect(invalidType.status).toBe(415)
    expect(invalidType.body.error.code).toBe('INVALID_IMAGE_TYPE')
    expect(oversized.status).toBe(413)
    expect(oversized.body.error.code).toBe('IMAGE_TOO_LARGE')
    expect(uploadStream).not.toHaveBeenCalled()
  })
})
