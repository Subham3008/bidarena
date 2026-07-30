import { User } from '../models/user.model.js'
import { AppError } from '../utils/app-error.js'
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '../utils/session.js'

export async function requireAuthentication(request, _response, next) {
  const token = request.cookies?.[SESSION_COOKIE_NAME]

  if (!token) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'))
    return
  }

  try {
    const payload = verifySessionToken(token)

    if (typeof payload.sub !== 'string') {
      throw new Error('Session subject is missing')
    }

    const user = await User.findById(payload.sub)

    if (!user) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'))
      return
    }

    request.user = user
    next()
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 500) {
      next(error)
      return
    }

    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required'))
  }
}
