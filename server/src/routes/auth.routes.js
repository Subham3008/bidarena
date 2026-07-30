import { Router } from 'express'

import {
  getCurrentUser,
  login,
  logout,
  register,
  updateCurrentUser,
} from '../controllers/auth.controller.js'
import { requireAuthentication } from '../middleware/auth.middleware.js'
import { validateBody } from '../middleware/validate.middleware.js'
import {
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/auth.validator.js'

const authRouter = Router()

authRouter.post('/register', validateBody(registerSchema), register)
authRouter.post('/login', validateBody(loginSchema), login)
authRouter.post('/logout', logout)
authRouter.get('/me', requireAuthentication, getCurrentUser)
authRouter.patch(
  '/me',
  requireAuthentication,
  validateBody(updateProfileSchema),
  updateCurrentUser,
)

export default authRouter
