import dotenv from 'dotenv'

dotenv.config({ quiet: true })

function parsePort(value) {
  const normalizedValue = String(value).trim()
  const port = Number(normalizedValue)

  if (
    !/^\d+$/.test(normalizedValue) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
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

function parsePositiveDuration(value, name) {
  const normalizedValue = String(value).trim()
  const match = /^([1-9]\d*)(ms|s|m|h|d|w|y)$/.exec(
    normalizedValue,
  )

  if (
    !match ||
    !Number.isSafeInteger(Number(match[1]))
  ) {
    throw new Error(
      `${name} must be a positive duration such as 15m`,
    )
  }

  return normalizedValue
}

function parseSameSite(value) {
  const sameSite = value.trim().toLowerCase()

  if (!['lax', 'none'].includes(sameSite)) {
    throw new Error('SESSION_COOKIE_SAME_SITE must be lax or none')
  }

  return sameSite
}

export function normalizeClientOrigin(value) {
  const origin = value.trim()

  if (!origin) {
    return ''
  }

  let url

  try {
    url = new URL(origin)
  } catch {
    throw new Error('CLIENT_URLS entries must be valid HTTP(S) origins')
  }

  const hasOnlyTrailingSlashes = /^\/+$/.test(url.pathname)

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !hasOnlyTrailingSlashes ||
    url.search ||
    url.hash
  ) {
    throw new Error('CLIENT_URLS entries must be valid HTTP(S) origins')
  }

  return url.origin
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

const nodeEnv = process.env.NODE_ENV ?? 'development'
const configuredClientUrls =
  process.env.CLIENT_URLS ?? process.env.CLIENT_URL
let startupConfigurationError = null

function readConfigurationValue(readValue, fallback) {
  try {
    return readValue()
  } catch (error) {
    startupConfigurationError ??= error
    return fallback
  }
}

const clientUrls = readConfigurationValue(
  () =>
    parseClientUrls(
      configuredClientUrls ?? 'http://localhost:5173',
    ),
  [],
)

export const env = Object.freeze({
  nodeEnv,
  host: process.env.HOST?.trim() || '0.0.0.0',
  port: readConfigurationValue(
    () => parsePort(process.env.PORT ?? '5000'),
    5000,
  ),
  clientUrlsConfigured: Boolean(configuredClientUrls?.trim()),
  clientUrls: Object.freeze(clientUrls),
  maxBidAmount: readConfigurationValue(
    () =>
      parsePositiveSafeInteger(
        process.env.MAX_BID_AMOUNT ?? '1000000000',
        'MAX_BID_AMOUNT',
      ),
    1_000_000_000,
  ),
  mongodbUri: process.env.MONGODB_URI?.trim(),
  get jwtAccessSecret() {
    return process.env.JWT_ACCESS_SECRET
  },
  accessTokenExpiry: readConfigurationValue(
    () =>
      parsePositiveDuration(
        process.env.ACCESS_TOKEN_EXPIRY ?? '15m',
        'ACCESS_TOKEN_EXPIRY',
      ),
    '15m',
  ),
  sessionCookieSameSite: readConfigurationValue(
    () =>
      parseSameSite(
        process.env.SESSION_COOKIE_SAME_SITE ?? 'lax',
      ),
    'lax',
  ),
  get cloudinaryCloudName() {
    return process.env.CLOUDINARY_CLOUD_NAME
  },
  get cloudinaryApiKey() {
    return process.env.CLOUDINARY_API_KEY
  },
  get cloudinaryApiSecret() {
    return process.env.CLOUDINARY_API_SECRET
  },
  get razorpayKeyId() {
    return process.env.RAZORPAY_KEY_ID
  },
  get razorpayKeySecret() {
    return process.env.RAZORPAY_KEY_SECRET
  },
})

function isPlaceholder(value) {
  return /^(your_|replace_|changeme|example)/i.test(value)
}

export function assertRequiredEnvironment(configuration = env) {
  const mongodbUri = configuration.mongodbUri?.trim() ?? ''
  const jwtAccessSecret =
    configuration.jwtAccessSecret?.trim() ?? ''

  if (configuration === env && startupConfigurationError) {
    throw startupConfigurationError
  }

  if (
    !['development', 'test', 'production'].includes(
      configuration.nodeEnv,
    )
  ) {
    throw new Error(
      'NODE_ENV must be development, test, or production',
    )
  }

  if (
    configuration.nodeEnv === 'production' &&
    !configuration.clientUrlsConfigured
  ) {
    throw new Error('CLIENT_URLS is required in production')
  }

  if (
    !Array.isArray(configuration.clientUrls) ||
    configuration.clientUrls.length === 0
  ) {
    throw new Error('CLIENT_URLS must include at least one origin')
  }

  if (
    !/^mongodb(\+srv)?:\/\//i.test(mongodbUri) ||
    isPlaceholder(mongodbUri)
  ) {
    throw new Error('MONGODB_URI must be a valid MongoDB connection URI')
  }

  if (!jwtAccessSecret || isPlaceholder(jwtAccessSecret)) {
    throw new Error('JWT_ACCESS_SECRET is required')
  }

  if (
    configuration.nodeEnv === 'production' &&
    jwtAccessSecret.length < 32
  ) {
    throw new Error(
      'JWT_ACCESS_SECRET must be at least 32 characters in production',
    )
  }

  parsePositiveDuration(
    configuration.accessTokenExpiry ?? '15m',
    'ACCESS_TOKEN_EXPIRY',
  )

  if (
    configuration.sessionCookieSameSite === 'none' &&
    configuration.nodeEnv !== 'production'
  ) {
    throw new Error(
      'SESSION_COOKIE_SAME_SITE=none requires NODE_ENV=production',
    )
  }
}
