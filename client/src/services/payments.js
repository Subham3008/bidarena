import { api } from './api.js'

export async function fetchPaymentStatus(auctionId, signal) {
  const response = await api.get(
    `/payments/auctions/${encodeURIComponent(auctionId)}`,
    { signal },
  )

  return response.data.data.payment
}

export async function createPaymentOrder(auctionId, signal) {
  const response = await api.post(
    `/payments/auctions/${encodeURIComponent(auctionId)}/order`,
    undefined,
    { signal },
  )

  return response.data.data.order
}

export async function verifyPayment(paymentResult, signal) {
  const response = await api.post('/payments/verify', paymentResult, {
    signal,
  })

  return response.data.data.payment
}
