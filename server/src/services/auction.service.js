import Auction from '../models/auction.model.js'
import Bid from '../models/bid.model.js'
import {
  cancelAuctionLifecycle,
  scheduleAuctionLifecycle,
} from './auction-timer-manager.js'
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
    category: auction.category ?? 'Other',
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
    category: auction.category ?? 'Other',
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
    category: auction.category ?? 'Other',
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
    category: auction.category ?? 'Other',
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
    winningAmount: auction.winningAmount ?? null,
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
        'title category image startBid currentBid startAt endAt status bidCount seller',
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
      'title description category image startBid minimumIncrement currentBid startAt endAt status bidCount seller createdAt updatedAt',
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
          'title category image status startAt endAt startBid currentBid bidCount currentBidder winner winningAmount paymentStatus',
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

const EDITABLE_AUCTION_FIELDS = new Set([
  'title',
  'description',
  'category',
  'image',
  'startBid',
  'minimumIncrement',
  'startAt',
  'endAt',
])

function assertOwner(auction, sellerId) {
  if (auction.seller.toString() !== sellerId.toString()) {
    throw new AppError(
      403,
      'AUCTION_FORBIDDEN',
      'Only the auction owner may manage this auction',
    )
  }
}

async function assertUpcomingAuctionCanBeManaged(auction, action) {
  const now = new Date()

  if (auction.status !== 'UPCOMING' || auction.startAt <= now) {
    throw new AppError(
      409,
      action === 'update' ? 'AUCTION_NOT_EDITABLE' : 'AUCTION_NOT_DELETABLE',
      `Only upcoming auctions that have not started may be ${action === 'update' ? 'edited' : 'deleted'}`,
    )
  }

  const acceptedBidExists =
    auction.bidCount > 0 || Boolean(await Bid.exists({ auction: auction._id }))

  if (acceptedBidExists) {
    throw new AppError(
      409,
      action === 'update' ? 'AUCTION_NOT_EDITABLE' : 'AUCTION_NOT_DELETABLE',
      `Auctions with accepted bids cannot be ${action === 'update' ? 'edited' : 'deleted'}`,
    )
  }
}

async function loadManagedAuction(auctionId, sellerId, action) {
  const auction = await Auction.findById(auctionId).select(
    '_id seller status startAt endAt bidCount version',
  )

  if (!auction) {
    throw new AppError(404, 'AUCTION_NOT_FOUND', 'Auction not found')
  }

  assertOwner(auction, sellerId)
  await assertUpcomingAuctionCanBeManaged(auction, action)
  return auction
}

function assertUpdatedSchedule(auction, auctionData) {
  const startAt = auctionData.startAt ?? auction.startAt
  const endAt = auctionData.endAt ?? auction.endAt

  if (startAt <= new Date()) {
    throw new AppError(
      409,
      'AUCTION_NOT_EDITABLE',
      'Only upcoming auctions that have not started may be edited',
    )
  }

  if (endAt <= startAt) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      [{ field: 'endAt', message: 'End date must be later than start date' }],
    )
  }
}

async function explainManagementRace(auctionId, sellerId, action) {
  const auction = await Auction.findById(auctionId).select(
    '_id seller status startAt endAt bidCount version',
  )

  if (!auction) {
    throw new AppError(404, 'AUCTION_NOT_FOUND', 'Auction not found')
  }

  assertOwner(auction, sellerId)
  await assertUpcomingAuctionCanBeManaged(auction, action)
  throw new AppError(
    409,
    action === 'update' ? 'AUCTION_NOT_EDITABLE' : 'AUCTION_NOT_DELETABLE',
    'Auction state changed; refresh and try again',
  )
}

function editableAuctionChanges(auctionData) {
  const unsafeFields = Object.keys(auctionData).filter(
    (field) => !EDITABLE_AUCTION_FIELDS.has(field),
  )

  if (unsafeFields.length > 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      unsafeFields.map((field) => ({
        field,
        message: 'Field cannot be updated',
      })),
    )
  }

  const changes = Object.fromEntries(
    Object.entries(auctionData).filter(([field]) =>
      EDITABLE_AUCTION_FIELDS.has(field),
    ),
  )

  if (Object.keys(changes).length === 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      [{ field: '', message: 'Provide at least one auction field to update' }],
    )
  }

  return changes
}

export async function updateAuction({ auctionId, sellerId, auctionData }) {
  const auction = await loadManagedAuction(auctionId, sellerId, 'update')
  const editableChanges = editableAuctionChanges(auctionData)
  assertUpdatedSchedule(auction, editableChanges)
  const scheduleChanged =
    (editableChanges.startAt !== undefined &&
      editableChanges.startAt.getTime() !== auction.startAt.getTime()) ||
    (editableChanges.endAt !== undefined &&
      editableChanges.endAt.getTime() !== auction.endAt.getTime())

  const changes = {
    ...editableChanges,
    ...(editableChanges.startBid === undefined
      ? {}
      : { currentBid: editableChanges.startBid }),
  }
  const updatedAuction = await Auction.findOneAndUpdate(
    {
      _id: auction._id,
      seller: sellerId,
      status: 'UPCOMING',
      startAt: { $gt: new Date() },
      bidCount: 0,
      version: auction.version,
    },
    { $set: changes, $inc: { version: 1 } },
    { returnDocument: 'after', runValidators: true },
  ).populate('seller', '_id displayName')

  if (!updatedAuction) {
    await explainManagementRace(auctionId, sellerId, 'update')
  }

  if (scheduleChanged) {
    scheduleAuctionLifecycle(updatedAuction)
  }

  return serializeCreatedAuction(updatedAuction)
}

export async function deleteAuction({ auctionId, sellerId }) {
  const auction = await loadManagedAuction(auctionId, sellerId, 'delete')

  const deletedAuction = await Auction.findOneAndDelete(
    {
      _id: auction._id,
      seller: sellerId,
      status: 'UPCOMING',
      startAt: { $gt: new Date() },
      bidCount: 0,
      version: auction.version,
    },
  )

  if (!deletedAuction) {
    await explainManagementRace(auctionId, sellerId, 'delete')
  }

  // The guarded deletion makes an already-running lifecycle callback inert.
  cancelAuctionLifecycle(deletedAuction._id)

  return deletedAuction._id.toString()
}
