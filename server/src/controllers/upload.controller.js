import { uploadAuctionImage } from '../services/auction-image.service.js'

export async function createAuctionImage(request, response) {
  const image = await uploadAuctionImage(request.file)

  response.status(201).json({
    success: true,
    data: image,
  })
}
