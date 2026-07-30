import { z } from 'zod'

const emailSchema = z
  .string()
  .trim()
  .email('Enter a valid email address')
  .max(254, 'Email is too long')
  .transform((email) => email.toLowerCase())

export const registerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(60, 'Display name must be at most 60 characters'),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(60, 'Name must be at most 60 characters')
      .optional(),
    avatar: z
      .union([
        z.string().trim().url('Enter a valid avatar URL').max(500),
        z.literal(''),
      ])
      .optional(),
    bio: z.string().trim().max(280, 'Bio must be at most 280 characters').optional(),
    location: z
      .string()
      .trim()
      .max(100, 'Location must be at most 100 characters')
      .optional(),
  })
  .strict()
  .refine((profile) => Object.keys(profile).length > 0, {
    message: 'Provide at least one profile field',
  })
