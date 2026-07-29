import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'

import { env } from './config/env.js'
import { errorHandler } from './middleware/error.middleware.js'
import authRouter from './routes/auth.routes.js'

const app = express()

app.disable('x-powered-by')
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
)
app.use(express.json())
app.use(cookieParser())

// Liveness stays dependency-free; readiness tells traffic whether MongoDB can serve work.
app.get('/health', (_request, response) => {
  response.status(200).json({
    success: true,
    message: 'BidArena server is running',
  })
})

app.get('/ready', (_request, response) => {
  const isDatabaseConnected = mongoose.connection.readyState === 1

  response.status(isDatabaseConnected ? 200 : 503).json({
    success: isDatabaseConnected,
    message: isDatabaseConnected
      ? 'BidArena server is ready'
      : 'BidArena server is not ready',
    database: isDatabaseConnected ? 'connected' : 'disconnected',
  })
})

app.use('/api/auth', authRouter)
app.use(errorHandler)

export default app
