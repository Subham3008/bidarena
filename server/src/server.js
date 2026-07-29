import { createServer } from 'node:http'

import app from './app.js'
import { env } from './config/env.js'

const httpServer = createServer(app)

httpServer.listen(env.port, env.host, () => {
  console.log(
    'BidArena server listening on http://' + env.host + ':' + env.port,
  )
})

function shutdown(signal) {
  console.log(signal + ' received; closing the HTTP server')

  httpServer.close((error) => {
    if (error) {
      console.error('HTTP server shutdown failed', error)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
