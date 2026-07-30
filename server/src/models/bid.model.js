import mongoose from 'mongoose'

const { Schema } = mongoose

const bidSchema = new Schema({
  auction: {
    type: Schema.Types.ObjectId,
    ref: 'Auction',
    required: true,
  },
  bidder: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  clientBidId: {
    type: String,
    required: true,
    trim: true,
  },
  // The server sequence gives every accepted bid a deterministic auction-local order.
  serverSequence: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isInteger,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true,
    required: true,
  },
})

// Auction-scoped idempotency prevents a retried client bid from being persisted twice.
bidSchema.index({ auction: 1, clientBidId: 1 }, { unique: true })
// A unique server sequence also protects deterministic ordering within each auction.
bidSchema.index({ auction: 1, serverSequence: 1 }, { unique: true })
bidSchema.index({ auction: 1, timestamp: -1 })
bidSchema.index({ bidder: 1, timestamp: -1 })

const Bid = mongoose.models.Bid ?? mongoose.model('Bid', bidSchema)

export default Bid
