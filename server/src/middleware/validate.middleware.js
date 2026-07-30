export function validateBody(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.body)

    if (!result.success) {
      response.status(400).json({
        success: false,
        message: 'Request validation failed',
        error: {
          code: 'VALIDATION_ERROR',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      })
      return
    }

    request.body = result.data
    next()
  }
}

export function validateQuery(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.query)

    if (!result.success) {
      response.status(400).json({
        success: false,
        message: 'Query validation failed',
        error: {
          code: 'VALIDATION_ERROR',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      })
      return
    }

    request.validatedQuery = result.data
    next()
  }
}

export function validateParams(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.params)

    if (!result.success) {
      response.status(400).json({
        success: false,
        message: 'Path validation failed',
        error: {
          code: 'VALIDATION_ERROR',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      })
      return
    }

    request.validatedParams = result.data
    next()
  }
}
