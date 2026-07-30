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

export async function updateAuction({ auctionId, auction }) {
  const response = await api.patch(`/auctions/${auctionId}`, auction)
  return response.data.data.auction
}

export async function deleteAuction(auctionId) {
  const response = await api.delete(`/auctions/${auctionId}`)
  return response.data.data
}

export async function uploadAuctionImage(file, { onProgress, signal } = {}) {
  const formData = new FormData()
  formData.append('image', file)

  const response = await api.post('/uploads/auction-image', formData, {
    signal,
    onUploadProgress(progressEvent) {
      if (!progressEvent.total) {
        return
      }

      onProgress?.(
        Math.min(100, Math.round((progressEvent.loaded / progressEvent.total) * 100)),
      )
    },
  })

  return response.data.data
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
