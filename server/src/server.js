import { createServer } from 'node:http'
import mongoose from 'mongoose'

import app from './app.js'
import { connectDatabase } from './config/database.js'
import {
  assertRequiredEnvironment,
  env,
} from './config/env.js'
import Payment from './models/payment.model.js'
import { recoverAuctionLifecycle } from './services/auction-lifecycle.service.js'
import { createAuctionTimerManager } from './services/auction-timer-manager.js'
import {
  createAuctionSocketServer,
  publishAuctionRealtime,
} from './sockets/auction-rooms.js'

const httpServer = createServer(app)
const io = createAuctionSocketServer(httpServer)
app.set('auctionSocketServer', io)
const auctionTimerManager = createAuctionTimerManager(io, {
  onLifecycleStateChanged: (auctionId) =>
    publishAuctionRealtime(io, auctionId),
})
const SHUTDOWN_TIMEOUT_MS = 10_000
let isShuttingDown = false

function listenHttpServer() {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      httpServer.off('error', handleError)
      httpServer.off('listening', handleListening)
      httpServer.off('close', handleClose)
    }
    const handleError = (error) => {
      cleanup()
      reject(error)
    }
    const handleListening = () => {
      cleanup()
      resolve()
    }
    const handleClose = () => {
      cleanup()
      reject(new Error('HTTP server closed before listening'))
    }

    httpServer.once('error', handleError)
    httpServer.once('listening', handleListening)
    httpServer.once('close', handleClose)
    httpServer.listen(env.port, env.host)
  })
}

async function startServer() {
  let startupStage = 'configuration'

  try {
    assertRequiredEnvironment()
    startupStage = 'MongoDB connection'
    // Accept traffic only after MongoDB is ready so startup never serves partial functionality.
    await connectDatabase()
    startupStage = 'database indexes'
    await Payment.init()
    startupStage = 'auction recovery'
    await recoverAuctionLifecycle()
    await auctionTimerManager.schedulePersistedAuctions()

    if (isShuttingDown) {
      return
    }

    startupStage = 'HTTP listener'
    await listenHttpServer()
    httpServer.on('error', () => {
      if (!isShuttingDown) {
        console.error('HTTP server runtime error')
        void shutdown('HTTP server failure', 1)
      }
    })
    console.log(
      'BidArena server listening on http://' + env.host + ':' + env.port,
    )
  } catch (error) {
    // Stage-only errors stay actionable without exposing credentials or driver details.
    const configurationReason =
      startupStage === 'configuration' &&
      error instanceof Error
        ? `: ${error.message}`
        : ''

    console.error(
      `BidArena startup failed during ${startupStage}${configurationReason}`,
    )
    await shutdown('Startup failure', 1)
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

async function shutdown(signal, requestedExitCode = 0) {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  console.log(signal + '; shutting down gracefully')
  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  forceExitTimer.unref()

  let shutdownFailed = false

  try {
    // Timers stop first so shutdown cannot start new lifecycle database work.
    await auctionTimerManager.shutdown()
  } catch {
    console.error('Auction timer shutdown failed')
    shutdownFailed = true
  }

  try {
    await closeSocketServer()
  } catch {
    console.error('Socket.IO shutdown failed')
    shutdownFailed = true
  }

  try {
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

  clearTimeout(forceExitTimer)

  if (shutdownFailed || requestedExitCode !== 0) {
    process.exitCode = 1
  } else {
    console.log('BidArena server shut down cleanly')
  }
}

process.once('SIGINT', () => shutdown('SIGINT received'))
process.once('SIGTERM', () => shutdown('SIGTERM received'))

startServer()
