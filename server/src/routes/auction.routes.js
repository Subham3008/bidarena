import { Router } from 'express'

import {
  createAuctionController,
  discoverAuctionsController,
  discoverOwnedAuctionsController,
  getAuctionDetailsController,
} from '../controllers/auction.controller.js'
import { requireAuthentication } from '../middleware/auth.middleware.js'
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../middleware/validate.middleware.js'
import {
  auctionParamsSchema,
  createAuctionSchema,
  discoverAuctionsSchema,
  mineAuctionsSchema,
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
auctionRouter.get(
  '/mine',
  requireAuthentication,
  validateQuery(mineAuctionsSchema),
  discoverOwnedAuctionsController,
)
auctionRouter.get(
  '/:auctionId',
  validateParams(auctionParamsSchema),
  getAuctionDetailsController,
)

export default auctionRouter
