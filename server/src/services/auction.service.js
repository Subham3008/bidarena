import Auction from '../models/auction.model.js'
import { scheduleAuctionLifecycle } from './auction-timer-manager.js'
import { AppError } from '../utils/app-error.js'


const SORT_OPTIONS = {
  newest: { createdAt: -1, _id: -1 },
  endingSoon: { endAt: 1, _id: 1 },
  priceLow: { currentBid: 1, _id: 1 },
  priceHigh: { currentBid: -1, _id: -1 },
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
}

function serializeSeller(seller) {
  if (!seller) {
    return null
  }

  return {
    _id: seller._id.toString(),
    name: seller.displayName,
  }
}

function serializeCreatedAuction(auction) {
  return {
    _id: auction._id.toString(),
    title: auction.title,
    description: auction.description,
    image: auction.image,
    startBid: auction.startBid,
    minimumIncrement: auction.minimumIncrement,
    currentBid: auction.currentBid,
    startAt: auction.startAt,
    endAt: auction.endAt,
    status: auction.status,
    bidCount: auction.bidCount,
    seller: serializeSeller(auction.seller),
    createdAt: auction.createdAt,
    updatedAt: auction.updatedAt,
  }
}

function serializeAuctionSummary(auction) {
  return {
    _id: auction._id.toString(),
    title: auction.title,
    image: auction.image,
    startBid: auction.startBid,
    currentBid: auction.currentBid,
    startAt: auction.startAt,
    endAt: auction.endAt,
    status: auction.status,
    bidCount: auction.bidCount,
    seller: serializeSeller(auction.seller),
  }
}

function serializeAuctionDetails(auction) {
  return {
    _id: auction._id.toString(),
    title: auction.title,
    description: auction.description,
    image: auction.image,
    startBid: auction.startBid,
    minimumIncrement: auction.minimumIncrement,
    currentBid: auction.currentBid,
    startAt: auction.startAt,
    endAt: auction.endAt,
    status: auction.status,
    bidCount: auction.bidCount,
    seller: serializeSeller(auction.seller),
    createdAt: auction.createdAt,
    updatedAt: auction.updatedAt,
  }
}

function serializeParticipant(user) {
  if (!user) {
    return null
  }

  return {
    _id: user._id.toString(),
    name: user.displayName,
    ...(user.avatar ? { avatar: user.avatar } : {}),
  }
}

function serializeOwnedAuction(auction) {
  return {
    _id: auction._id.toString(),
    title: auction.title,
    image: auction.image,
    status: auction.status,
    startAt: auction.startAt,
    endAt: auction.endAt,
    startBid: auction.startBid,
    currentBid: auction.currentBid,
    bidCount: auction.bidCount,
    currentBidder: serializeParticipant(auction.currentBidder),
    winner: serializeParticipant(auction.winner),
    paymentStatus: auction.paymentStatus,
  }
}

export async function createAuction({ sellerId, auctionData }) {
  const now = new Date()
  const status = auctionData.startAt > now ? 'UPCOMING' : 'ACTIVE'

  // Seller identity and mutable auction state always come from the server.
  const auction = await Auction.create({
    ...auctionData,
    seller: sellerId,
    status,
    currentBid: auctionData.startBid,
    currentBidder: null,
    winner: null,
    bidCount: 0,
  })

  scheduleAuctionLifecycle(auction)
  await auction.populate('seller', '_id displayName')
  return serializeCreatedAuction(auction)
}

export async function discoverAuctions({
  status,
  search,
  page,
  limit,
  sort,
}) {
  const filter = {
    status: {
      $in: ['UPCOMING', 'ACTIVE', 'COMPLETED'],
    },
  }

  if (status) {
    filter.status = status
  }

  if (search) {
    filter.title = {
      $regex: escapeRegularExpression(search),
      $options: 'i',
    }
  }

  const skip = (page - 1) * limit
  const [auctions, totalItems] = await Promise.all([
    Auction.find(filter)
      .select(
        'title image startBid currentBid startAt endAt status bidCount seller',
      )
      .sort(SORT_OPTIONS[sort])
      .skip(skip)
      .limit(limit)
      .populate('seller', '_id displayName')
      .lean(),
    Auction.countDocuments(filter),
  ])

  return {
    auctions: auctions.map(serializeAuctionSummary),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  }
}

export async function getAuctionDetails(auctionId) {
  const auction = await Auction.findById(auctionId)
    .select(
      'title description image startBid minimumIncrement currentBid startAt endAt status bidCount seller createdAt updatedAt',
    )
    .populate('seller', '_id displayName')
    .lean()

  if (!auction) {
    throw new AppError(404, 'AUCTION_NOT_FOUND', 'Auction not found')
  }

  return serializeAuctionDetails(auction)
}

export async function discoverOwnedAuctions({ sellerId, status, page, limit }) {
  const ownedLifecycleFilter = {
    seller: sellerId,
    status: { $in: ['UPCOMING', 'ACTIVE', 'COMPLETED'] },
  }
  const filter = status
    ? { seller: sellerId, status }
    : ownedLifecycleFilter
  const skip = (page - 1) * limit
  const [auctions, totalItems, total, upcoming, active, completed] =
    await Promise.all([
      Auction.find(filter)
        .select(
          'title image status startAt endAt startBid currentBid bidCount currentBidder winner paymentStatus',
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate([
          { path: 'currentBidder', select: '_id displayName avatar' },
          { path: 'winner', select: '_id displayName avatar' },
        ])
        .lean(),
      Auction.countDocuments(filter),
      Auction.countDocuments(ownedLifecycleFilter),
      Auction.countDocuments({ seller: sellerId, status: 'UPCOMING' }),
      Auction.countDocuments({ seller: sellerId, status: 'ACTIVE' }),
      Auction.countDocuments({ seller: sellerId, status: 'COMPLETED' }),
    ])

  return {
    auctions: auctions.map(serializeOwnedAuction),
    summary: { total, upcoming, active, completed },
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  }
}
