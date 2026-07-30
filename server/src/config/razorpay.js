import Razorpay from 'razorpay'

import { AppError } from '../utils/app-error.js'
import { env } from './env.js'

const RAZORPAY_REQUEST_TIMEOUT_MS = 15_000

function isPlaceholder(value) {
  return /your|replace|placeholder|example|changeme/i.test(value)
}

export function getRazorpayConfiguration() {
  const keyId = env.razorpayKeyId?.trim() ?? ''
  const keySecret = env.razorpayKeySecret?.trim() ?? ''

  if (
    !keyId.startsWith('rzp_test_') ||
    keyId.length === 'rzp_test_'.length ||
    !keySecret ||
    isPlaceholder(keyId) ||
    isPlaceholder(keySecret)
  ) {
    throw new AppError(
      503,
      'PAYMENT_CONFIGURATION_ERROR',
      'Payment service is not configured',
    )
  }

  return { keyId, keySecret }
}

export function getSafeRazorpayKeyId() {
  try {
    return getRazorpayConfiguration().keyId
  } catch {
    return null
  }
}

export function createRazorpayClient() {
  const { keyId, keySecret } = getRazorpayConfiguration()

  try {
    const client = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })

    // Bound gateway calls well below the Mongo claim lease before recovery.
    client.api.rq.defaults.timeout = RAZORPAY_REQUEST_TIMEOUT_MS

    return {
      client,
      keyId,
    }
  } catch {
    throw new AppError(
      503,
      'PAYMENT_CONFIGURATION_ERROR',
      'Payment service is not configured',
    )
  }
}
