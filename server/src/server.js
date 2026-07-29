import { createServer } from 'node:http'
import mongoose from 'mongoose'

import app from './app.js'
import { connectDatabase } from './config/database.js'
import { env } from './config/env.js'
import { recoverAuctionLifecycle } from './services/auction-lifecycle.service.js'
import { createAuctionTimerManager } from './services/auction-timer-manager.js'
import { createAuctionSocketServer } from './sockets/auction-rooms.js'

const httpServer = createServer(app)
const io = createAuctionSocketServer(httpServer)
const auctionTimerManager = createAuctionTimerManager(io)
let isShuttingDown = false

async function startServer() {
  try {
    // Accept traffic only after MongoDB is ready so startup never serves partial functionality.
    await connectDatabase()
    await recoverAuctionLifecycle()
    await auctionTimerManager.schedulePersistedAuctions()

    httpServer.listen(env.port, env.host, () => {
      console.log(
        'BidArena server listening on http://' + env.host + ':' + env.port,
      )
    })
  } catch {
    // Keep connection strings and driver details out of startup logs.
    console.error('MongoDB connection failed; BidArena server was not started')
    process.exit(1)
  }
}

function closeHttpServer() {
  if (!httpServer.listening) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function closeSocketServer() {
  return new Promise((resolve) => {
    io.close(resolve)
  })
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  console.log(signal + ' received; shutting down gracefully')

  // Stop new requests before disconnecting MongoDB so in-flight work can finish safely.
  let shutdownFailed = false

  try {
    // Timers stop first so shutdown cannot start new lifecycle database work.
    await auctionTimerManager.shutdown()
    await closeSocketServer()
    await closeHttpServer()
  } catch {
    console.error('HTTP server shutdown failed')
    shutdownFailed = true
  }

  try {
    await mongoose.disconnect()
  } catch {
    console.error('MongoDB shutdown failed')
    shutdownFailed = true
  }

  if (shutdownFailed) {
    process.exitCode = 1
  } else {
    console.log('BidArena server shut down cleanly')
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

startServer()
