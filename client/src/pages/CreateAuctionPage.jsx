import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { createAuction } from '../services/auctions.js'

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
      .max(2000, 'Use at most 2000 characters'),
    image: z.string().trim().url('Enter a valid image URL'),
    startBid: z
      .number({ error: 'Enter a starting bid' })
      .positive('Starting bid must be greater than zero'),
    minimumIncrement: z
      .number({ error: 'Enter a minimum increment' })
      .min(1, 'Minimum increment must be at least 1'),
    startAt: dateTimeField,
    endAt: dateTimeField,
  })
  .superRefine((values, context) => {
    const startAt = new Date(values.startAt)
    const endAt = new Date(values.endAt)

    if (endAt <= startAt) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'End date must be later than start date',
      })
    }

    if (endAt <= new Date()) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'End date must be in the future',
      })
    }
  })

function FieldError({ message }) {
  return message ? (
    <span className="mt-1.5 block text-sm text-red-700">{message}</span>
  ) : null
}

export function CreateAuctionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const mutation = useMutation({ mutationFn: createAuction })
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(auctionSchema),
    defaultValues: {
      title: '',
      description: '',
      image: '',
      startBid: '',
      minimumIncrement: '',
      startAt: '',
      endAt: '',
    },
  })

  async function onSubmit(values) {
    try {
      await mutation.mutateAsync({
        ...values,
        startAt: new Date(values.startAt).toISOString(),
        endAt: new Date(values.endAt).toISOString(),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['auctions'] }),
        queryClient.invalidateQueries({ queryKey: ['my-auctions'] }),
      ])
      reset()
      toast.success('Auction created successfully')
      navigate('/auctions')
    } catch (error) {
      const details = error.response?.data?.error?.details ?? []

      for (const detail of details) {
        if (detail.field in values) {
          setError(detail.field, { type: 'server', message: detail.message })
        }
      }

      toast.error(
        error.response?.data?.message ??
          'Auction could not be created. Please try again.',
      )
    }
  }

  const inputClassName =
    'mt-2 w-full rounded-sm border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 disabled:bg-stone-100'

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <MarketplaceHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link
          to="/auctions"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-950"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to auctions
        </Link>

        <div className="mt-6">
          <p className="text-sm font-semibold text-emerald-800">
            New listing
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Create an auction
          </h1>
          <p className="mt-2 text-stone-600">
            Add clear item details, pricing, and a reliable schedule.
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-8 space-y-6 border-t border-stone-200 pt-8"
          noValidate
        >
          <label className="block text-sm font-medium">
            Title
            <input
              type="text"
              autoComplete="off"
              disabled={isSubmitting}
              className={inputClassName}
              {...register('title')}
            />
            <FieldError message={errors.title?.message} />
          </label>

          <label className="block text-sm font-medium">
            Description
            <textarea
              rows="5"
              disabled={isSubmitting}
              className={inputClassName}
              {...register('description')}
            />
            <FieldError message={errors.description?.message} />
          </label>

          <label className="block text-sm font-medium">
            Image URL
            <input
              type="url"
              inputMode="url"
              placeholder="https://example.com/item.jpg"
              disabled={isSubmitting}
              className={inputClassName}
              {...register('image')}
            />
            <FieldError message={errors.image?.message} />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Starting bid
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                disabled={isSubmitting}
                className={inputClassName}
                {...register('startBid', { valueAsNumber: true })}
              />
              <FieldError message={errors.startBid?.message} />
            </label>
            <label className="block text-sm font-medium">
              Minimum increment
              <input
                type="number"
                min="1"
                step="0.01"
                inputMode="decimal"
                disabled={isSubmitting}
                className={inputClassName}
                {...register('minimumIncrement', { valueAsNumber: true })}
              />
              <FieldError message={errors.minimumIncrement?.message} />
            </label>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Start date and time
              <input
                type="datetime-local"
                disabled={isSubmitting}
                className={inputClassName}
                {...register('startAt')}
              />
              <FieldError message={errors.startAt?.message} />
            </label>
            <label className="block text-sm font-medium">
              End date and time
              <input
                type="datetime-local"
                disabled={isSubmitting}
                className={inputClassName}
                {...register('endAt')}
              />
              <FieldError message={errors.endAt?.message} />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-stone-200 pt-6 sm:flex-row sm:justify-end">
            <Link
              to="/auctions"
              className="rounded-sm border border-stone-300 bg-white px-5 py-2.5 text-center text-sm font-medium text-stone-800 hover:border-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-sm bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {isSubmitting ? 'Creating auction…' : 'Create auction'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
