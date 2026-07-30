import mongoose from 'mongoose'

import Auction from '../models/auction.model.js'
import ChatMessage from '../models/chat-message.model.js'
import { serializeParticipant } from './auction-payload.service.js'

export class ChatRejectedError extends Error {}

function reject(message) {
  throw new ChatRejectedError(message)
}

function escapeHtml(text) {
  const replacements = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }

  return text.replace(/[&<>"']/g, (character) => replacements[character])
}

export function normalizeChatMessageInput(payload) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  const clientMessageId =
    typeof payload?.clientMessageId === 'string'
      ? payload.clientMessageId.trim()
      : ''

  if (!text) {
    reject('Chat message text is required')
  }

  if (text.length > 300) {
    reject('Chat message must be 300 characters or fewer')
  }

  if (!clientMessageId) {
    reject('clientMessageId is required')
  }

  if (clientMessageId.length > 128) {
    reject('clientMessageId is too long')
  }

  return { text, clientMessageId }
}

function serializeChatMessage(message) {
  return {
    id: message._id.toString(),
    auctionId: message.auction.toString(),
    sender: serializeParticipant(message.sender),
    text: escapeHtml(message.text),
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt,
  }
}

export async function createChatMessage({
  auctionId,
  senderId,
  text,
  clientMessageId,
}) {
  const input = normalizeChatMessageInput({ text, clientMessageId })
  const auctionExists = await Auction.exists({ _id: auctionId })

  if (!auctionExists) {
    reject('Auction not found')
  }

  // The unique index remains authoritative; this check gives retries a clear response.
  const duplicate = await ChatMessage.exists({
    sender: senderId,
    clientMessageId: input.clientMessageId,
  })

  if (duplicate) {
    reject('Duplicate chat message')
  }

  try {
    const message = await ChatMessage.create({
      auction: auctionId,
      sender: senderId,
      ...input,
    })
    await message.populate('sender', '_id displayName avatar')
    return serializeChatMessage(message)
  } catch (error) {
    if (error?.code === 11000) {
      throw new ChatRejectedError('Duplicate chat message')
    }

    throw error
  }
}

export async function loadChatHistory(auctionId) {
  if (!mongoose.isObjectIdOrHexString(auctionId)) {
    return null
  }

  const auctionExists = await Auction.exists({ _id: auctionId })

  if (!auctionExists) {
    return null
  }

  const messages = await ChatMessage.find({ auction: auctionId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(50)
    .populate('sender', '_id displayName avatar')
    .lean()

  return messages.reverse().map(serializeChatMessage)
}
