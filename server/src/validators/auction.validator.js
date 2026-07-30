import { z } from 'zod'

const dateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Enter a valid date and time' })
  .transform((value) => new Date(value))

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(120, 'Title must be at most 120 characters')

const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description is required')
  .max(2000, 'Description must be at most 2000 characters')

const categorySchema = z
  .string()
  .trim()
  .min(1, 'Category is required')
  .max(80, 'Category must be at most 80 characters')

const imageSchema = z
  .string()
  .trim()
  .url('Enter a valid image URL')
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'Image URL must use HTTPS' },
  )

const startBidSchema = z
  .number()
  .finite()
  .positive('Start bid must be greater than zero')
  .max(Number.MAX_SAFE_INTEGER, 'Start bid is too large')

const minimumIncrementSchema = z
  .number()
  .finite()
  .min(1, 'Minimum increment must be at least 1')
  .max(Number.MAX_SAFE_INTEGER, 'Minimum increment is too large')

export const createAuctionSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    category: categorySchema.optional(),
    image: imageSchema,
    startBid: startBidSchema,
    minimumIncrement: minimumIncrementSchema,
    startAt: dateTimeSchema,
    endAt: dateTimeSchema,
  })
  .strict()
  .superRefine((values, context) => {
    if (values.endAt <= values.startAt) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'End date must be later than start date',
      })
    }

    if (values.endAt <= new Date()) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'End date must be in the future',
      })
    }
  })

export const updateAuctionSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    category: categorySchema.optional(),
    image: imageSchema.optional(),
    startBid: startBidSchema.optional(),
    minimumIncrement: minimumIncrementSchema.optional(),
    startAt: dateTimeSchema.optional(),
    endAt: dateTimeSchema.optional(),
  })
  .strict()
  .superRefine((values, context) => {
    if (Object.keys(values).length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Provide at least one auction field to update',
      })
    }

    const now = new Date()

    if (values.startAt && values.startAt <= now) {
      context.addIssue({
        code: 'custom',
        path: ['startAt'],
        message: 'Start date must be in the future',
      })
    }

    if (values.endAt && values.endAt <= now) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'End date must be in the future',
      })
    }

    if (values.startAt && values.endAt && values.endAt <= values.startAt) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'End date must be later than start date',
      })
    }
  })

export const discoverAuctionsSchema = z.object({
  status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED']).optional(),
  search: z.string().trim().max(100, 'Search is too long').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
  sort: z
    .enum(['newest', 'endingSoon', 'priceLow', 'priceHigh'])
    .default('newest'),
})

export const mineAuctionsSchema = z.object({
  status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
})

export const auctionParamsSchema = z.object({
  auctionId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, 'Enter a valid auction ID'),
})
