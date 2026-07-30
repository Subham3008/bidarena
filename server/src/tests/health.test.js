import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../app.js'
import { createCorsOriginValidator } from '../config/cors.js'
import {
  assertRequiredEnvironment,
  parseClientUrls,
} from '../config/env.js'

describe('GET /health', () => {
  it('reports that the server is running', async () => {
    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      message: 'BidArena server is running',
    })
  })
})

describe('GET /ready', () => {
  it('reports MongoDB as unavailable while disconnected', async () => {
    const response = await request(app).get('/ready')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      success: false,
      message: 'BidArena server is not ready',
      database: 'disconnected',
    })
  })
})

describe('CORS origin allowlist', () => {
  it('normalizes configured origins and preserves server-side requests', async () => {
    const origins = parseClientUrls(
      ' http://localhost:5173/, https://app.example.com///, http://localhost:5173 ',
    )
    const validateOrigin = createCorsOriginValidator(origins)
    const check = (origin) =>
      new Promise((resolve) => {
        validateOrigin(origin, (error, allowed) => {
          resolve({ error, allowed })
        })
      })

    expect(origins).toEqual([
      'http://localhost:5173',
      'https://app.example.com',
    ])
    await expect(check('https://app.example.com/')).resolves.toEqual({
      error: null,
      allowed: true,
    })
    await expect(check(undefined)).resolves.toEqual({
      error: null,
      allowed: true,
    })
    const rejected = await check('https://unknown.example.com')
    expect(rejected.error).toMatchObject({
      statusCode: 403,
      code: 'ORIGIN_NOT_ALLOWED',
    })
    expect(() =>
      parseClientUrls('https://app.example.com/path'),
    ).toThrow('valid HTTP(S) origins')
  })
})

describe('production environment validation', () => {
  const validProductionEnvironment = {
    nodeEnv: 'production',
    clientUrlsConfigured: true,
    clientUrls: ['https://app.example.com'],
    mongodbUri: 'mongodb://localhost:27017/bidarena',
    jwtAccessSecret: 'x'.repeat(32),
    accessTokenExpiry: '15m',
    sessionCookieSameSite: 'lax',
  }

  it('requires explicit origins and strong core credentials', () => {
    expect(() =>
      assertRequiredEnvironment(validProductionEnvironment),
    ).not.toThrow()
    expect(() =>
      assertRequiredEnvironment({
        ...validProductionEnvironment,
        clientUrlsConfigured: false,
      }),
    ).toThrow('CLIENT_URLS is required in production')
    expect(() =>
      assertRequiredEnvironment({
        ...validProductionEnvironment,
        jwtAccessSecret: 'short',
      }),
    ).toThrow('at least 32 characters')
    expect(() =>
      assertRequiredEnvironment({
        ...validProductionEnvironment,
        accessTokenExpiry: 'soon',
      }),
    ).toThrow('positive duration')
  })
})
