import {
  createPaymentOrder,
  getPaymentStatus,
  verifyPayment,
} from '../services/payment.service.js'

export async function createPaymentOrderController(request, response) {
  const order = await createPaymentOrder({
    auctionId: request.validatedParams.auctionId,
    userId: request.user._id,
  })

  response.status(201).json({
    success: true,
    message: 'Payment order ready',
    data: { order },
  })
}

export async function verifyPaymentController(request, response) {
  const result = await verifyPayment({
    ...request.body,
    userId: request.user._id,
  })

  if (result.didTransition) {
    const io = request.app.get('auctionSocketServer')
    const auctionId = result.payment.auctionId

    io?.to(`auction:${auctionId}`).emit(
      'payment_status_updated',
      {
        auctionId,
        paymentStatus: 'SUCCESSFUL',
        serverTime: Date.now(),
      },
    )
  }

  response.status(200).json({
    success: true,
    message: 'Payment verified successfully',
    data: { payment: result.payment },
  })
}

export async function getPaymentStatusController(request, response) {
  const payment = await getPaymentStatus({
    auctionId: request.validatedParams.auctionId,
    userId: request.user._id,
  })

  response.status(200).json({
    success: true,
    message: 'Payment status fetched successfully',
    data: { payment },
  })
}
