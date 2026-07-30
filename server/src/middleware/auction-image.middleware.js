import multer from 'multer'

import { AppError } from '../utils/app-error.js'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
  },
  fileFilter(_request, file, callback) {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      callback(
        new AppError(
          415,
          'INVALID_IMAGE_TYPE',
          'Auction image must be JPEG, PNG, or WebP',
        ),
      )
      return
    }

    callback(null, true)
  },
})

const receiveImage = upload.single('image')

export function receiveAuctionImage(request, response, next) {
  receiveImage(request, response, (error) => {
    if (!error) {
      next()
      return
    }

    if (error instanceof AppError) {
      next(error)
      return
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError(
            413,
            'IMAGE_TOO_LARGE',
            'Auction image must be 5 MB or smaller',
          ),
        )
        return
      }

      next(
        new AppError(
          400,
          'INVALID_IMAGE_UPLOAD',
          'Provide one auction image in the image field',
        ),
      )
      return
    }

    next(
      new AppError(
        400,
        'INVALID_IMAGE_UPLOAD',
        'Unable to read the auction image',
      ),
    )
  })
}
