import { z } from 'zod'

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Enter a valid auction ID')

export const paymentAuctionParamsSchema = z.object({
  auctionId: objectIdSchema,
})

export const verifyPaymentSchema = z
  .object({
    auctionId: objectIdSchema,
    razorpayOrderId: z.string().trim().min(1).max(120),
    razorpayPaymentId: z.string().trim().min(1).max(120),
    razorpaySignature: z
      .string()
      .trim()
      .regex(/^[a-f\d]{64}$/i, 'Enter a valid payment signature'),
  })
  .strict()
