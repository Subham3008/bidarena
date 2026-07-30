import { Router } from 'express'

import { createAuctionImage } from '../controllers/upload.controller.js'
import { requireAuthentication } from '../middleware/auth.middleware.js'
import { receiveAuctionImage } from '../middleware/auction-image.middleware.js'

const uploadRouter = Router()

uploadRouter.post(
  '/auction-image',
  requireAuthentication,
  receiveAuctionImage,
  createAuctionImage,
)

export default uploadRouter
