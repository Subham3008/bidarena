import { z } from 'zod'

const dateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Enter a valid date and time' })
  .transform((value) => new Date(value))

export const createAuctionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(120, 'Title must be at most 120 characters'),
    description: z
      .string()
      .trim()
      .min(1, 'Description is required')
      .max(2000, 'Description must be at most 2000 characters'),
    image: z.string().trim().url('Enter a valid image URL'),
    startBid: z
      .number()
      .finite()
      .positive('Start bid must be greater than zero'),
    minimumIncrement: z
      .number()
      .finite()
      .min(1, 'Minimum increment must be at least 1'),
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
