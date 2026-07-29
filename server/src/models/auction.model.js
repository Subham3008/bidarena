import mongoose from 'mongoose'

const { Schema } = mongoose

const auctionSchema = new Schema(
  {
    seller: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
    startBid: {
      type: Number,
      required: true,
      min: 0,
    },
    minimumIncrement: {
      type: Number,
      required: true,
      min: 1,
    },
    currentBid: {
      type: Number,
      required: true,
      min: 0,
      default() {
        return this.startBid
      },
    },
    currentBidder: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
      default: 'UPCOMING',
      required: true,
    },
    winner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    winningAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    bidCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    // This per-auction sequence is the durable ordering source for accepted bids.
    sequence: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    timelineSequence: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'SUCCESSFUL', 'FAILED'],
      default: 'PENDING',
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: 'version',
  },
)

// Status/time indexes support discovery plus startup activation and expiry scans.
auctionSchema.index({ status: 1, startAt: 1 })
auctionSchema.index({ status: 1, endAt: 1 })
auctionSchema.index({ seller: 1, createdAt: -1 })
auctionSchema.index({ winner: 1, updatedAt: -1 })

const Auction = mongoose.models.Auction ?? mongoose.model('Auction', auctionSchema)

export default Auction
