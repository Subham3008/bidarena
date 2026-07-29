import {
  authenticateUser,
  registerUser,
  updateUserProfile,
} from '../services/auth.service.js'
import {
  assertSessionConfiguration,
  createSessionToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../utils/session.js'

function setSessionCookie(response, userId) {
  response.cookie(
    SESSION_COOKIE_NAME,
    createSessionToken(userId),
    getSessionCookieOptions(),
  )
}

export async function register(request, response) {
  assertSessionConfiguration()
  const user = await registerUser(request.body)

  setSessionCookie(response, user.id)
  response.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user: user.toSafeObject(),
    },
  })
}

export async function login(request, response) {
  assertSessionConfiguration()
  const user = await authenticateUser(request.body)

  setSessionCookie(response, user.id)
  response.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      user: user.toSafeObject(),
    },
  })
}

export function logout(_request, response) {
  response.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions())
  response.status(200).json({
    success: true,
    message: 'Logout successful',
  })
}

export function getCurrentUser(request, response) {
  response.status(200).json({
    success: true,
    message: 'Current user retrieved',
    data: {
      user: request.user.toSafeObject(),
    },
  })
}

export async function updateCurrentUser(request, response) {
  const user = await updateUserProfile(request.user, request.body)

  response.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: { user: user.toSafeObject() },
  })
}
