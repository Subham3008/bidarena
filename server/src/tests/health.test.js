import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../app.js'

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
