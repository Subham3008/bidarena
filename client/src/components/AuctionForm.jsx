import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, CalendarClock, Gavel, ImageIcon, Package } from 'lucide-react'
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
  'mt-2 w-full rounded-sm border border-stone-300 bg-white px-3 py-2.5 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:bg-stone-100'

function FieldError({ id, message }) {
  return message ? (
    <span id={id} className="mt-1.5 block text-sm text-red-700" role="alert">
      {message}
    </span>
  ) : null
}

function SectionHeading({ icon: Icon, title, description }) {
  return (
    <div className="mb-5 flex items-start gap-3 border-b border-stone-200 pb-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center bg-emerald-50 text-emerald-800">
        {createElement(Icon, { size: 18, 'aria-hidden': true })}
      </span>
      <div>
        <h2 className="font-semibold text-stone-950">{title}</h2>
        <p className="mt-1 text-sm text-stone-500">{description}</p>
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
  const image = useWatch({ control, name: 'image' })
  const formDisabled = isSubmitting

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
    <form onSubmit={handleSubmit(submitForm)} className="mt-8 space-y-6" noValidate>
      <section className="border border-stone-200 bg-white p-5 sm:p-6">
        <SectionHeading
          icon={Package}
          title="Product information"
          description="Help buyers understand exactly what is being offered."
        />
        <div className="space-y-5">
          <label className="block text-sm font-medium">
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
            <FieldError id="auction-title-error" message={errors.title?.message} />
          </label>

          <label className="block text-sm font-medium">
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
              className="mt-1.5 block text-xs font-normal text-stone-500"
            >
              Include condition, key details, and what the winner will receive.
            </span>
            <FieldError
              id="auction-description-error"
              message={errors.description?.message}
            />
          </label>

          <label className="block text-sm font-medium">
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

      <section className="border border-stone-200 bg-white p-5 sm:p-6">
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

      <section className="border border-stone-200 bg-white p-5 sm:p-6">
        <SectionHeading
          icon={Gavel}
          title="Bidding rules"
          description="Set a clear opening amount and minimum step for each new bid."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium">
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
          <label className="block text-sm font-medium">
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

      <section className="border border-stone-200 bg-white p-5 sm:p-6">
        <SectionHeading
          icon={CalendarClock}
          title="Auction schedule"
          description="Times are shown in your local timezone. Both dates must remain in the future."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium">
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
          <label className="block text-sm font-medium">
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

      <section className="border border-stone-200 bg-white p-5 sm:p-6">
        <SectionHeading
          icon={ArrowRight}
          title="Review and submit"
          description="Check the image, pricing, and schedule before saving."
        />

        {submissionError ? (
          <p className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
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
            className={`rounded-sm border border-stone-300 bg-white px-5 py-2.5 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 ${
              formDisabled
                ? 'cursor-not-allowed text-stone-400'
                : 'text-stone-800 hover:border-stone-400'
            }`}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || isUploading}
            className="rounded-sm bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
          >
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
