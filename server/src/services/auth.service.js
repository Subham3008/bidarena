import bcrypt from 'bcryptjs'

import { User } from '../models/user.model.js'
import { AppError } from '../utils/app-error.js'

const PASSWORD_HASH_ROUNDS = 12

export async function registerUser({ displayName, email, password }) {
  const existingUser = await User.exists({ email })

  if (existingUser) {
    throw new AppError(
      409,
      'EMAIL_ALREADY_REGISTERED',
      'An account with this email already exists',
    )
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS)

  try {
    return await User.create({
      displayName,
      email,
      passwordHash,
    })
  } catch (error) {
    // The unique index closes the race between the pre-check and document creation.
    if (error?.code === 11000) {
      throw new AppError(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists',
      )
    }

    throw error
  }
}

export async function authenticateUser({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash')
  const isPasswordValid =
    user && (await bcrypt.compare(password, user.passwordHash))

  if (!isPasswordValid) {
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid email or password',
    )
  }

  return user
}
