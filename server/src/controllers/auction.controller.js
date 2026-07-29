import {
  createAuction,
  discoverAuctions,
} from '../services/auction.service.js'

export async function createAuctionController(request, response) {
  const auction = await createAuction({
    sellerId: request.user._id,
    auctionData: request.body,
  })

  response.status(201).json({
    success: true,
    message: 'Auction created successfully',
    data: {
      auction,
    },
  })
}

export async function discoverAuctionsController(request, response) {
  const data = await discoverAuctions(request.validatedQuery)

  response.status(200).json({
    success: true,
    message: 'Auctions fetched successfully',
    data,
  })
}
