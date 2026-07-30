import mongoose from 'mongoose'

const { Schema } = mongoose

const chatMessageSchema = new Schema({
  auction: {
    type: Schema.Types.ObjectId,
    ref: 'Auction',
    required: true,
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300,
  },
  clientMessageId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
    required: true,
  },
})

// Sender-scoped idempotency prevents a retried chat command from persisting twice.
chatMessageSchema.index(
  { sender: 1, clientMessageId: 1 },
  { unique: true },
)
chatMessageSchema.index({ auction: 1, createdAt: -1, _id: -1 })

const ChatMessage =
  mongoose.models.ChatMessage ??
  mongoose.model('ChatMessage', chatMessageSchema)

export default ChatMessage
