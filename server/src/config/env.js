import dotenv from 'dotenv'

dotenv.config({ quiet: true })

function parsePort(value) {
  const port = Number.parseInt(value, 10)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  return port
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: parsePort(process.env.PORT ?? '5000'),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  mongodbUri: process.env.MONGODB_URI,
})
