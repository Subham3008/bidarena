import { Router } from 'express'

import {
  createAuctionController,
  discoverAuctionsController,
} from '../controllers/auction.controller.js'
import { requireAuthentication } from '../middleware/auth.middleware.js'
import {
  validateBody,
  validateQuery,
} from '../middleware/validate.middleware.js'
import {
  createAuctionSchema,
  discoverAuctionsSchema,
} from '../validators/auction.validator.js'

const auctionRouter = Router()

auctionRouter.get(
  '/',
  validateQuery(discoverAuctionsSchema),
  discoverAuctionsController,
)
auctionRouter.post(
  '/',
  requireAuthentication,
  validateBody(createAuctionSchema),
  createAuctionController,
)

export default auctionRouter
