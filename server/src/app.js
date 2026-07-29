import express from 'express'
import mongoose from 'mongoose'

const app = express()

app.disable('x-powered-by')
app.use(express.json())

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

export default app
