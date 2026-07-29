import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'

export function errorHandler(error, _request, response, next) {
  if (response.headersSent) {
    next(error)
    return
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: {
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
    })
    return
  }

  if (env.nodeEnv !== 'test') {
    console.error('Unhandled request error', error)
  }

  response.status(500).json({
    success: false,
    message: 'An unexpected error occurred',
    error: {
      code: 'INTERNAL_ERROR',
    },
  })
}
