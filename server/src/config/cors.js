import { env, normalizeClientOrigin } from './env.js'
import { AppError } from '../utils/app-error.js'

export function createCorsOriginValidator(allowedOrigins) {
  const allowlist = new Set(allowedOrigins.map(normalizeClientOrigin))

  return (origin, callback) => {
    if (!origin || allowlist.has(normalizeClientOrigin(origin))) {
      callback(null, true)
      return
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
