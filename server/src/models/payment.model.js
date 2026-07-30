import mongoose from 'mongoose'

const { Schema } = mongoose

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

const paymentSchema = new Schema(
  {
    auction: {
      type: Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      unique: true,
    },
    winner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESSFUL', 'FAILED'],
      default: 'PENDING',
      required: true,
    },
    winningAmount: {
      type: Number,
      required: true,
      validate: isPositiveSafeInteger,
    },
    amount: {
      type: Number,
      required: true,
      validate: isPositiveSafeInteger,
    },
    paidAmount: {
      type: Number,
      default: null,
      validate: {
        validator(value) {
          return value === null || isPositiveSafeInteger(value)
        },
        message: 'Paid amount must be a positive safe integer',
      },
    },
    currency: {
      type: String,
      enum: ['INR'],
      default: 'INR',
      required: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    orderCreationToken: {
      type: String,
      select: false,
    },
    orderCreationExpiresAt: {
      type: Date,
      select: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
)

// One record per auction and unique provider IDs enforce durable payment idempotency.
paymentSchema.index({ razorpayOrderId: 1 }, { unique: true, sparse: true })
paymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true })
paymentSchema.index({ winner: 1, status: 1, updatedAt: -1 })

const Payment =
  mongoose.models.Payment ?? mongoose.model('Payment', paymentSchema)

export default Payment
