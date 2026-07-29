import mongoose from 'mongoose'

const { Schema } = mongoose

const timelineSchema = new Schema({
  auction: {
    type: Schema.Types.ObjectId,
    ref: 'Auction',
    required: true,
  },
  eventType: {
    type: String,
    required: true,
    trim: true,
  },
  actor: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // Timeline sequences keep persisted events in a stable auction-local order.
  sequence: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isInteger,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: () => ({}),
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true,
    required: true,
  },
})

// One unique sequence per auction makes timeline replay deterministic.
timelineSchema.index({ auction: 1, sequence: 1 }, { unique: true })

const Timeline =
  mongoose.models.Timeline ?? mongoose.model('Timeline', timelineSchema)

export default Timeline
