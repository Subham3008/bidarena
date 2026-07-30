import dotenv from 'dotenv'

dotenv.config({ quiet: true })

function parsePort(value) {
  const port = Number.parseInt(value, 10)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  return port
}

function parsePositiveSafeInteger(value, name) {
  const number = Number(value)

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive safe integer`)
  }

  return number
}

export function normalizeClientOrigin(value) {
  return value.trim().replace(/\/+$/, '')
}

export function parseClientUrls(value) {
  return [
    ...new Set(
      value
        .split(',')
        .map(normalizeClientOrigin)
        .filter(Boolean),
    ),
  ]
}

const clientUrls = parseClientUrls(
  process.env.CLIENT_URLS ??
    process.env.CLIENT_URL ??
    'http://localhost:5173',
)

if (clientUrls.length === 0) {
  throw new Error('CLIENT_URLS must include at least one origin')
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: parsePort(process.env.PORT ?? '5000'),
  clientUrls: Object.freeze(clientUrls),
  maxBidAmount: parsePositiveSafeInteger(
    process.env.MAX_BID_AMOUNT ?? '1000000000',
    'MAX_BID_AMOUNT',
  ),
  mongodbUri: process.env.MONGODB_URI,
  get jwtAccessSecret() {
    return process.env.JWT_ACCESS_SECRET
  },
  get accessTokenExpiry() {
    return process.env.ACCESS_TOKEN_EXPIRY ?? '15m'
  },
  get cloudinaryCloudName() {
    return process.env.CLOUDINARY_CLOUD_NAME
  },
  get cloudinaryApiKey() {
    return process.env.CLOUDINARY_API_KEY
  },
  get cloudinaryApiSecret() {
    return process.env.CLOUDINARY_API_SECRET
  },
})
