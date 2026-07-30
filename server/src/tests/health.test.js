import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../app.js'
import { createCorsOriginValidator } from '../config/cors.js'
import { parseClientUrls } from '../config/env.js'

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
  })
})
