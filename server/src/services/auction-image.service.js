import { v2 as cloudinary } from 'cloudinary'

import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'

function matchesBytes(buffer, bytes, offset = 0) {
  return (
    buffer.length >= offset + bytes.length &&
    bytes.every((byte, index) => buffer[offset + index] === byte)
  )
}

function hasValidImageSignature(file) {
  if (file.mimetype === 'image/jpeg') {
    return matchesBytes(file.buffer, [0xff, 0xd8, 0xff])
  }

  if (file.mimetype === 'image/png') {
    return matchesBytes(
      file.buffer,
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    )
  }

  if (file.mimetype === 'image/webp') {
    return (
      matchesBytes(file.buffer, [0x52, 0x49, 0x46, 0x46]) &&
      matchesBytes(file.buffer, [0x57, 0x45, 0x42, 0x50], 8)
    )
  }

  return false
}

function isPlaceholder(value) {
  return /^(your_|replace_|changeme|example)/i.test(value)
}

function getCloudinaryConfiguration() {
  const cloudName = env.cloudinaryCloudName?.trim() ?? ''
  const apiKey = env.cloudinaryApiKey?.trim() ?? ''
  const apiSecret = env.cloudinaryApiSecret?.trim() ?? ''

  if (
    !cloudName ||
    !apiKey ||
    !apiSecret ||
    isPlaceholder(cloudName) ||
    isPlaceholder(apiKey) ||
    isPlaceholder(apiSecret)
  ) {
    throw new AppError(
      503,
      'IMAGE_UPLOAD_UNAVAILABLE',
      'Image upload is not configured',
    )
  }

  return { cloudName, apiKey, apiSecret }
}

function uploadBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'bidarena/auctions',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      },
      (error, result) => {
        if (error) {
          reject(error)
          return
        }

        resolve(result)
      },
    )

    stream.end(buffer)
  })
}

export async function uploadAuctionImage(file) {
  if (!file) {
    throw new AppError(
      400,
      'IMAGE_REQUIRED',
      'Auction image is required',
    )
  }

  if (!hasValidImageSignature(file)) {
    throw new AppError(
      415,
      'INVALID_IMAGE_CONTENT',
      'File content must be a valid JPEG, PNG, or WebP image',
    )
  }

  const { cloudName, apiKey, apiSecret } =
    getCloudinaryConfiguration()

  try {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    })

    const result = await uploadBuffer(file.buffer)

    if (!result?.secure_url || !result.public_id) {
      throw new Error('Cloudinary response was incomplete')
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
    }
  } catch {
    throw new AppError(
      502,
      'IMAGE_UPLOAD_FAILED',
      'Unable to upload auction image',
    )
  }
}
