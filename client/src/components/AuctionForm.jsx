import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowRight,
  CalendarClock,
  Gavel,
  ImageIcon,
  LoaderCircle,
  Package,
} from 'lucide-react'
import { createElement, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import { getApiErrorMessage } from '../services/api.js'
import { AuctionImageUpload } from './AuctionImageUpload.jsx'

const currencyString = z
  .string()
  .trim()
  .min(1, 'Enter an amount')
  .regex(/^\d+(?:\.\d{1,2})?$/, 'Use a normal amount with up to two decimal places')
  .refine((value) => {
    const amount = Number(value)
    return Number.isFinite(amount) && amount > 0 && amount <= Number.MAX_SAFE_INTEGER
  }, 'Enter a positive, safe amount')

const minimumIncrementString = currencyString.refine(
  (value) => Number(value) >= 1,
  'Minimum increment must be at least ₹1',
)

const dateTimeField = z
  .string()
  .min(1, 'Choose a date and time')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Choose a valid date and time',
  })

const auctionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Enter an auction title')
      .max(120, 'Use at most 120 characters'),
    description: z
      .string()
      .trim()
      .min(1, 'Enter a description')
      .max(2000, 'Use at most 2,000 characters'),
    category: z.string().trim().max(80, 'Use at most 80 characters'),
    image: z
      .string()
      .trim()
      .min(1, 'Upload an item image')
      .url('Upload a valid item image')
      .refine((value) => value.startsWith('https://'), {
        message: 'Uploaded images must use a secure URL',
      }),
    startBid: currencyString,
    minimumIncrement: minimumIncrementString,
    startAt: dateTimeField,
    endAt: dateTimeField,
  })
  .superRefine((values, context) => {
    const now = new Date()
    const startAt = new Date(values.startAt)
    const endAt = new Date(values.endAt)

    if (startAt <= now) {
      context.addIssue({
        code: 'custom',
        path: ['startAt'],
        message: 'Start date must be in the future',
      })
    }

    if (endAt <= startAt) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'End date must be later than start date',
      })
    }
  })

const DEFAULT_VALUES = {
  title: '',
  description: '',
  category: '',
  image: '',
  startBid: '',
  minimumIncrement: '',
  startAt: '',
  endAt: '',
}

const inputClassName =
  'field-control mt-2 placeholder:text-stone-400'

function FieldError({ id, message }) {
  return message ? (
    <span id={id} className="mt-1.5 block text-sm text-red-700">
      {message}
    </span>
  ) : null
}

function SectionHeading({ icon: Icon, title, description }) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--color-green-soft)] text-[var(--color-green-primary)]">
        {createElement(Icon, { size: 18, 'aria-hidden': true })}
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-stone-950">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
          {description}
        </p>
      </div>
    </div>
  )
}

function toAuctionPayload(values) {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    category: values.category.trim() || 'Other',
    image: values.image,
    startBid: Number(values.startBid),
    minimumIncrement: Number(values.minimumIncrement),
    startAt: new Date(values.startAt).toISOString(),
    endAt: new Date(values.endAt).toISOString(),
  }
}

export function AuctionForm({
  initialValues = DEFAULT_VALUES,
  onSubmit,
  submitLabel,
  submittingLabel,
  cancelTo,
}) {
  const [isUploading, setIsUploading] = useState(false)
  const [submissionError, setSubmissionError] = useState('')
  const {
    control,
    clearErrors,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(auctionSchema),
    defaultValues: { ...DEFAULT_VALUES, ...initialValues },
  })
  const [image, title, description] = useWatch({
    control,
    name: ['image', 'title', 'description'],
  })
  const formDisabled = isSubmitting
  const errorCount = Object.keys(errors).length

  async function submitForm(values) {
    setSubmissionError('')

    try {
      await onSubmit(toAuctionPayload(values))
    } catch (error) {
      const details = error.response?.data?.error?.details ?? []

      for (const detail of details) {
        if (detail.field in values) {
          setError(detail.field, { type: 'server', message: detail.message })
        }
      }

      setSubmissionError(
        getApiErrorMessage(
          error,
          'The auction could not be saved. Review the form and try again.',
        ),
      )
    }
  }

  return (
    <form
      onSubmit={handleSubmit(submitForm)}
      className="surface-card mt-8 overflow-hidden"
      aria-busy={isSubmitting || isUploading}
      noValidate
    >
      {errorCount > 0 ? (
        <div
          className="feedback-error m-5 px-4 py-3 text-sm sm:m-7"
          role="alert"
        >
          Review {errorCount} {errorCount === 1 ? 'field' : 'fields'} marked
          below before submitting.
        </div>
      ) : null}

      <section className="border-b border-stone-200 p-5 sm:p-7">
        <SectionHeading
          icon={Package}
          title="Product information"
          description="Help buyers understand exactly what is being offered."
        />
        <div className="space-y-5">
          <label className="field-label">
            Auction title <span className="text-red-700" aria-hidden="true">*</span>
            <input
              id="auction-title"
              type="text"
              autoComplete="off"
              required
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'auction-title-error' : undefined}
              disabled={formDisabled}
              className={inputClassName}
              {...register('title')}
            />
            <span className="field-help flex justify-end tabular-nums">
              {(title ?? '').length}/120
            </span>
            <FieldError id="auction-title-error" message={errors.title?.message} />
          </label>

          <label className="field-label">
            Description <span className="text-red-700" aria-hidden="true">*</span>
            <textarea
              id="auction-description"
              rows="5"
              required
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description
                  ? 'auction-description-help auction-description-error'
                  : 'auction-description-help'
              }
              disabled={formDisabled}
              className={inputClassName}
              {...register('description')}
            />
            <span
              id="auction-description-help"
              className="field-help flex items-start justify-between gap-3 font-normal"
            >
              <span>
                Include condition, key details, and what the winner will
                receive.
              </span>
              <span className="shrink-0 tabular-nums">
                {(description ?? '').length}/2000
              </span>
            </span>
            <FieldError
              id="auction-description-error"
              message={errors.description?.message}
            />
          </label>

          <label className="field-label">
            Category <span className="font-normal text-stone-500">(optional)</span>
            <input
              id="auction-category"
              type="text"
              autoComplete="off"
              placeholder="For example, Electronics or Collectibles"
              aria-invalid={Boolean(errors.category)}
              aria-describedby={
                errors.category ? 'auction-category-error' : undefined
              }
              disabled={formDisabled}
              className={inputClassName}
              {...register('category')}
            />
            <FieldError
              id="auction-category-error"
              message={errors.category?.message}
            />
          </label>
        </div>
      </section>

      <section className="border-b border-stone-200 p-5 sm:p-7">
        <SectionHeading
          icon={ImageIcon}
          title="Product image"
          description="Use a clear image that accurately represents the item."
        />
        <AuctionImageUpload
          value={image}
          disabled={formDisabled}
          error={errors.image?.message}
          onUploadingChange={(uploading) => {
            setIsUploading(uploading)
            if (uploading) {
              clearErrors('image')
            }
          }}
          onChange={(url, { shouldValidate = true } = {}) => {
            setValue('image', url, {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate,
            })
          }}
        />
      </section>

      <section className="border-b border-stone-200 p-5 sm:p-7">
        <SectionHeading
          icon={Gavel}
          title="Bidding rules"
          description="Set a clear opening amount and minimum step for each new bid."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="field-label">
            Starting bid (₹) <span className="text-red-700" aria-hidden="true">*</span>
            <input
              id="auction-start-bid"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="1000"
              required
              aria-invalid={Boolean(errors.startBid)}
              aria-describedby={
                errors.startBid ? 'auction-start-bid-error' : undefined
              }
              disabled={formDisabled}
              className={inputClassName}
              {...register('startBid')}
            />
            <FieldError
              id="auction-start-bid-error"
              message={errors.startBid?.message}
            />
          </label>
          <label className="field-label">
            Minimum increment (₹) <span className="text-red-700" aria-hidden="true">*</span>
            <input
              id="auction-minimum-increment"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="100"
              required
              aria-invalid={Boolean(errors.minimumIncrement)}
              aria-describedby={
                errors.minimumIncrement
                  ? 'auction-minimum-increment-error'
                  : undefined
              }
              disabled={formDisabled}
              className={inputClassName}
              {...register('minimumIncrement')}
            />
            <FieldError
              id="auction-minimum-increment-error"
              message={errors.minimumIncrement?.message}
            />
          </label>
        </div>
      </section>

      <section className="border-b border-stone-200 p-5 sm:p-7">
        <SectionHeading
          icon={CalendarClock}
          title="Auction schedule"
          description="Times are shown in your local timezone. Both dates must remain in the future."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="field-label">
            Starts <span className="text-red-700" aria-hidden="true">*</span>
            <input
              id="auction-start-at"
              type="datetime-local"
              step="1"
              required
              aria-invalid={Boolean(errors.startAt)}
              aria-describedby={
                errors.startAt ? 'auction-start-at-error' : undefined
              }
              disabled={formDisabled}
              className={inputClassName}
              {...register('startAt')}
            />
            <FieldError
              id="auction-start-at-error"
              message={errors.startAt?.message}
            />
          </label>
          <label className="field-label">
            Ends <span className="text-red-700" aria-hidden="true">*</span>
            <input
              id="auction-end-at"
              type="datetime-local"
              step="1"
              required
              aria-invalid={Boolean(errors.endAt)}
              aria-describedby={errors.endAt ? 'auction-end-at-error' : undefined}
              disabled={formDisabled}
              className={inputClassName}
              {...register('endAt')}
            />
            <FieldError id="auction-end-at-error" message={errors.endAt?.message} />
          </label>
        </div>
      </section>

      <section className="bg-stone-50/80 p-5 sm:p-7">
        <SectionHeading
          icon={ArrowRight}
          title="Review and submit"
          description="Check the image, pricing, and schedule before saving."
        />

        {submissionError ? (
          <p className="feedback-error mb-4 p-3 text-sm" role="alert">
            {submissionError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            to={cancelTo}
            aria-disabled={formDisabled}
            tabIndex={formDisabled ? -1 : undefined}
            onClick={(event) => {
              if (formDisabled) {
                event.preventDefault()
              }
            }}
            className={`btn-secondary px-5 text-center ${
              formDisabled
                ? 'cursor-not-allowed text-stone-400'
                : ''
            }`}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || isUploading}
            className="btn-primary min-w-40 px-5"
          >
            {isSubmitting || isUploading ? (
              <LoaderCircle
                size={16}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : null}
            {isUploading
              ? 'Waiting for image upload…'
              : isSubmitting
                ? submittingLabel
                : submitLabel}
          </button>
        </div>
      </section>
    </form>
  )
}
