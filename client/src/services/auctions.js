import { api } from './api.js'

export async function fetchAuctions(filters, signal) {
  const response = await api.get('/auctions', {
    params: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      page: filters.page,
      limit: filters.limit,
      sort: filters.sort,
    },
    signal,
  })

  return response.data.data
}

export async function createAuction(auction) {
  const response = await api.post('/auctions', auction)
  return response.data.data.auction
}

export async function fetchAuction(auctionId, signal) {
  const response = await api.get(`/auctions/${auctionId}`, { signal })
  return response.data.data.auction
}

export async function fetchOwnedAuctions(filters, signal) {
  const response = await api.get('/auctions/mine', {
    params: {
      ...(filters.status ? { status: filters.status } : {}),
      page: filters.page,
      limit: filters.limit,
    },
    signal,
  })

  return response.data.data
}
