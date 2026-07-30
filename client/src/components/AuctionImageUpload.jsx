import { CheckCircle2, ImagePlus, LoaderCircle, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { getApiErrorMessage } from '../services/api.js'
import { uploadAuctionImage } from '../services/auctions.js'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateImage(file) {
  if (!file || file.size === 0) {
    return 'Choose a non-empty image file.'
  }

  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return 'Choose a JPG, PNG, or WebP image.'
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return 'Choose an image that is 5 MB or smaller.'
  }

  return ''
}

export function AuctionImageUpload({
  value,
  onChange,
  onUploadingChange,
  disabled,
  error,
}) {
  const inputRef = useRef(null)
  const objectUrlRef = useRef(null)
  const uploadControllerRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [fileDetails, setFileDetails] = useState(null)
  const [uploadState, setUploadState] = useState(value ? 'uploaded' : 'idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  useEffect(
    () => () => {
      uploadControllerRef.current?.abort()
      uploadControllerRef.current = null
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    },
    [],
  )

  function releaseObjectUrl() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  async function selectFile(file) {
    uploadControllerRef.current?.abort()
    uploadControllerRef.current = null
    onUploadingChange?.(false)
    const validationMessage = validateImage(file)

    if (validationMessage) {
      setUploadError(validationMessage)
      setUploadState('error')
      return
    }

    releaseObjectUrl()

    const nextPreviewUrl = URL.createObjectURL(file)
    objectUrlRef.current = nextPreviewUrl
    setPreviewUrl(nextPreviewUrl)
    setFileDetails({ name: file.name, size: formatFileSize(file.size) })
    setUploadError('')
    setUploadProgress(0)
    setUploadState('uploading')
    onUploadingChange?.(true)

    const controller = new AbortController()
    uploadControllerRef.current = controller

    try {
      const uploadedImage = await uploadAuctionImage(file, {
        signal: controller.signal,
        onProgress: setUploadProgress,
      })

      if (uploadControllerRef.current !== controller) {
        return
      }

      onChange(uploadedImage.url, { shouldValidate: true })
      setUploadProgress(100)
      setUploadState('uploaded')
      uploadControllerRef.current = null
      onUploadingChange?.(false)
    } catch (uploadFailure) {
      if (
        uploadFailure.code === 'ERR_CANCELED' ||
        uploadControllerRef.current !== controller
      ) {
        return
      }

      releaseObjectUrl()
      setPreviewUrl('')
      setFileDetails(null)
      setUploadError(
        getApiErrorMessage(
          uploadFailure,
          'Image upload failed. Check your connection and try again.',
        ),
      )
      setUploadState('error')
      uploadControllerRef.current = null
      onUploadingChange?.(false)
    }
  }

  function handleInputChange(event) {
    const [file] = event.target.files
    void selectFile(file)
    event.target.value = ''
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)

    if (!disabled) {
      void selectFile(event.dataTransfer.files?.[0])
    }
  }

  function removeImage() {
    uploadControllerRef.current?.abort()
    uploadControllerRef.current = null
    releaseObjectUrl()
    setPreviewUrl('')
    setFileDetails(null)
    setUploadState('idle')
    setUploadProgress(0)
    setUploadError('')
    onUploadingChange?.(false)
    onChange('', { shouldValidate: true })
  }

  const displayedImage = previewUrl || value
  const isUploading = uploadState === 'uploading'

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleInputChange}
        disabled={disabled || isUploading}
        aria-label={displayedImage ? 'Replace auction image' : 'Choose auction image'}
        aria-required="true"
        aria-invalid={Boolean(uploadError || error)}
        aria-describedby={uploadError || error ? 'auction-image-error' : undefined}
      />

      {displayedImage ? (
        <div className="overflow-hidden border border-stone-200 bg-white">
          <div className="grid gap-4 p-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
            <div className="aspect-[4/3] overflow-hidden bg-stone-100">
              <img
                src={displayedImage}
                alt="Auction item preview"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-900">
                {fileDetails?.name ?? 'Current auction image'}
              </p>
              {fileDetails ? (
                <p className="mt-1 text-sm text-stone-500">{fileDetails.size}</p>
              ) : null}

              {isUploading ? (
                <div className="mt-3" aria-live="polite">
                  <div className="flex items-center justify-between gap-3 text-sm text-stone-600">
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                      Uploading image
                    </span>
                    <span className="tabular-nums">{uploadProgress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden bg-stone-200">
                    <div
                      className="h-full bg-emerald-700 transition-[width]"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : uploadState === 'uploaded' && value ? (
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-800" role="status">
                  <CheckCircle2 size={16} aria-hidden="true" /> Image uploaded
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled || isUploading}
                  className="inline-flex items-center gap-2 rounded-sm border border-stone-300 px-3 py-2 text-sm font-medium hover:border-emerald-700 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  <Upload size={16} aria-hidden="true" /> Replace image
                </button>
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={disabled}
                  className="inline-flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  <Trash2 size={16} aria-hidden="true" /> Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`grid min-h-48 place-items-center border border-dashed px-5 py-8 text-center transition ${
            isDragging
              ? 'border-emerald-700 bg-emerald-50'
              : 'border-stone-300 bg-stone-50'
          }`}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div>
            <ImagePlus className="mx-auto text-stone-400" size={30} aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-stone-800">
              Drag and drop an item image here
            </p>
            <p className="mt-1 text-xs text-stone-500">JPG, PNG or WebP · maximum 5 MB</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="mt-4 rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:border-emerald-700 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
            >
              Choose image
            </button>
          </div>
        </div>
      )}

      {uploadError || error ? (
        <p
          id="auction-image-error"
          className="mt-2 text-sm text-red-700"
          role="alert"
        >
          {uploadError || error}
        </p>
      ) : null}
    </div>
  )
}
