import { env, normalizeClientOrigin } from './env.js'
import { AppError } from '../utils/app-error.js'

export function createCorsOriginValidator(allowedOrigins) {
  const allowlist = new Set(allowedOrigins.map(normalizeClientOrigin))

  return (origin, callback) => {
    if (!origin) {
      callback(null, true)
      return
    }

    try {
      if (allowlist.has(normalizeClientOrigin(origin))) {
        callback(null, true)
        return
      }
    } catch {
      // Invalid browser origins follow the same public rejection path.
    }

    callback(
      new AppError(
        403,
        'ORIGIN_NOT_ALLOWED',
        'Origin is not allowed',
      ),
    )
  }
}

export const corsOptions = {
  origin: createCorsOriginValidator(env.clientUrls),
  credentials: true,
}
