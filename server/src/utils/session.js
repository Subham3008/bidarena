import jwt from 'jsonwebtoken'

import { env } from '../config/env.js'
import { AppError } from './app-error.js'

export const SESSION_COOKIE_NAME = 'bidarena_session'

function getJwtSecret() {
  if (!env.jwtAccessSecret) {
    throw new AppError(
      500,
      'AUTH_CONFIGURATION_ERROR',
      'Authentication is not configured',
    )
  }

  return env.jwtAccessSecret
}

export function assertSessionConfiguration() {
  getJwtSecret()
}

export function createSessionToken(userId) {
  return jwt.sign({ sub: userId }, getJwtSecret(), {
    expiresIn: env.accessTokenExpiry,
    issuer: 'bidarena',
    audience: 'bidarena-web',
  })
}

export function verifySessionToken(token) {
  return jwt.verify(token, getJwtSecret(), {
    issuer: 'bidarena',
    audience: 'bidarena-web',
  })
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  }
}
