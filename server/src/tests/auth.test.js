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
} from 'vitest'

import app from '../app.js'
import { User } from '../models/user.model.js'

describe('authentication API', () => {
  let mongoServer

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough'
    mongoServer = await MongoMemoryServer.create()
    await mongoose.connect(mongoServer.getUri())
  }, 120000)

  afterEach(async () => {
    await User.deleteMany({})
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })

  it('registers a user, hashes the password, and returns safe data', async () => {
    const response = await request(app).post('/api/auth/register').send({
      displayName: 'Subham',
      email: 'Subham@example.com',
      password: 'password123',
    })

    expect(response.status).toBe(201)
    expect(response.headers['set-cookie']?.[0]).toContain('bidarena_session=')
    expect(response.body.data.user).toMatchObject({
      displayName: 'Subham',
      email: 'subham@example.com',
    })
    expect(response.body.data.user).not.toHaveProperty('password')
    expect(response.body.data.user).not.toHaveProperty('passwordHash')

    const storedUser = await User.findOne({
      email: 'subham@example.com',
    }).select('+passwordHash')

    expect(storedUser.passwordHash).not.toBe('password123')
  })

  it('rejects a duplicate email regardless of case', async () => {
    await request(app).post('/api/auth/register').send({
      displayName: 'Subham',
      email: 'subham@example.com',
      password: 'password123',
    })

    const response = await request(app).post('/api/auth/register').send({
      displayName: 'Another User',
      email: 'SUBHAM@example.com',
      password: 'password456',
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED')
  })

  it('logs in with valid credentials and sets a session cookie', async () => {
    await request(app).post('/api/auth/register').send({
      displayName: 'Subham',
      email: 'subham@example.com',
      password: 'password123',
    })

    const response = await request(app).post('/api/auth/login').send({
      email: 'subham@example.com',
      password: 'password123',
    })

    expect(response.status).toBe(200)
    expect(response.headers['set-cookie']?.[0]).toContain('bidarena_session=')
    expect(response.body.data.user.email).toBe('subham@example.com')
  })

  it('returns a generic error for invalid credentials', async () => {
    await request(app).post('/api/auth/register').send({
      displayName: 'Subham',
      email: 'subham@example.com',
      password: 'password123',
    })

    const response = await request(app).post('/api/auth/login').send({
      email: 'subham@example.com',
      password: 'wrong-password',
    })

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      success: false,
      message: 'Invalid email or password',
      error: {
        code: 'INVALID_CREDENTIALS',
      },
    })
  })

  it('protects /me and restores the authenticated user from the cookie', async () => {
    const anonymousResponse = await request(app).get('/api/auth/me')
    expect(anonymousResponse.status).toBe(401)

    const agent = request.agent(app)
    await agent.post('/api/auth/register').send({
      displayName: 'Subham',
      email: 'subham@example.com',
      password: 'password123',
    })

    const authenticatedResponse = await agent.get('/api/auth/me')

    expect(authenticatedResponse.status).toBe(200)
    expect(authenticatedResponse.body.data.user).toMatchObject({
      displayName: 'Subham',
      email: 'subham@example.com',
    })
    expect(authenticatedResponse.body.data.user).not.toHaveProperty(
      'passwordHash',
    )
  })

  it('rejects unsafe profile update fields', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/register').send({
      displayName: 'Subham',
      email: 'subham@example.com',
      password: 'password123',
    })

    const response = await agent.patch('/api/auth/me').send({
      email: 'changed@example.com',
      role: 'ADMIN',
    })
    const profile = await agent.get('/api/auth/me')

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(profile.body.data.user.email).toBe('subham@example.com')
  })
})
