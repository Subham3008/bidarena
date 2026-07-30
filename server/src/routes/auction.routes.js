import { Router } from 'express'

import {
  createAuctionController,
  deleteAuctionController,
  discoverAuctionsController,
  discoverOwnedAuctionsController,
  getAuctionDetailsController,
  updateAuctionController,
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
  updateAuctionSchema,
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
auctionRouter.patch(
  '/:auctionId',
  requireAuthentication,
  validateParams(auctionParamsSchema),
  validateBody(updateAuctionSchema),
  updateAuctionController,
)
auctionRouter.delete(
  '/:auctionId',
  requireAuthentication,
  validateParams(auctionParamsSchema),
  deleteAuctionController,
)

export default auctionRouter
