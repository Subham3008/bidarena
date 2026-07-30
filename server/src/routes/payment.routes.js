import { Router } from 'express'

import {
  createPaymentOrderController,
  getPaymentStatusController,
  verifyPaymentController,
} from '../controllers/payment.controller.js'
import { requireAuthentication } from '../middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
} from '../middleware/validate.middleware.js'
import {
  paymentAuctionParamsSchema,
  verifyPaymentSchema,
} from '../validators/payment.validator.js'

const paymentRouter = Router()

paymentRouter.post(
  '/auctions/:auctionId/order',
  requireAuthentication,
  validateParams(paymentAuctionParamsSchema),
  createPaymentOrderController,
)
paymentRouter.post(
  '/verify',
  requireAuthentication,
  validateBody(verifyPaymentSchema),
  verifyPaymentController,
)
paymentRouter.get(
  '/auctions/:auctionId',
  requireAuthentication,
  validateParams(paymentAuctionParamsSchema),
  getPaymentStatusController,
)

export default paymentRouter
