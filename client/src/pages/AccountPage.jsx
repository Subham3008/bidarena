import { zodResolver } from '@hookform/resolvers/zod'
import { MapPin, Pencil, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { MarketplaceHeader } from '../components/MarketplaceHeader.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getApiErrorMessage } from '../services/api.js'

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(60, 'Name must be at most 60 characters'),
  avatar: z.union([
    z.string().trim().url('Enter a valid avatar URL').max(500),
    z.literal(''),
  ]),
  bio: z.string().trim().max(280, 'Bio must be at most 280 characters'),
  location: z
    .string()
    .trim()
    .max(100, 'Location must be at most 100 characters'),
})

function Avatar({ user }) {
  const [imageFailed, setImageFailed] = useState(false)

  if (user.avatar && !imageFailed) {
    return (
      <img
        src={user.avatar}
        alt=""
        className="h-24 w-24 rounded-full border border-stone-200 object-cover"
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <div className="grid h-24 w-24 place-items-center rounded-full bg-emerald-50 text-2xl font-semibold text-emerald-800 ring-1 ring-emerald-200">
      {user.displayName.slice(0, 1).toUpperCase()}
    </div>
  )
}

function FieldError({ message }) {
  return message ? (
    <span className="mt-1.5 block text-sm text-red-700">{message}</span>
  ) : null
}

export function AccountPage() {
  const { user, logout, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user.displayName,
      avatar: user.avatar ?? '',
      bio: user.bio ?? '',
      location: user.location ?? '',
    },
  })

  async function handleLogout() {
    setIsLoggingOut(true)
    setLogoutError('')

    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setLogoutError(
        getApiErrorMessage(error, 'Logout failed. Please try again.'),
      )
    } finally {
      setIsLoggingOut(false)
    }
  }

  async function saveProfile(values) {
    try {
      const updatedUser = await updateProfile(values)
      reset({
        displayName: updatedUser.displayName,
        avatar: updatedUser.avatar ?? '',
        bio: updatedUser.bio ?? '',
        location: updatedUser.location ?? '',
      })
      setIsEditing(false)
      toast.success('Profile updated successfully')
    } catch (error) {
      const details = error.response?.data?.error?.details ?? []

      for (const detail of details) {
        if (detail.field in values) {
          setError(detail.field, { type: 'server', message: detail.message })
        }
      }

      toast.error(getApiErrorMessage(error, 'Profile could not be updated.'))
    }
  }

  function cancelEditing() {
    reset({
      displayName: user.displayName,
      avatar: user.avatar ?? '',
      bio: user.bio ?? '',
      location: user.location ?? '',
    })
    setIsEditing(false)
  }

  const inputClassName =
    'mt-2 w-full rounded-sm border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 disabled:bg-stone-100'

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <MarketplaceHeader />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Your account</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Profile</h1>
            <p className="mt-2 text-stone-600">
              Keep your public seller information clear and current.
            </p>
          </div>
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex w-fit items-center gap-2 rounded-sm border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium hover:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              <Pencil size={16} aria-hidden="true" /> Edit profile
            </button>
          ) : null}
        </div>

        <section className="mt-8 border border-stone-200 bg-white p-6 sm:p-8">
          {!isEditing ? (
            <div>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <Avatar user={user} />
                <div>
                  <h2 className="text-2xl font-semibold">{user.displayName}</h2>
                  <p className="mt-1 text-stone-600">{user.email}</p>
                  {user.location ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-stone-500">
                      <MapPin size={16} aria-hidden="true" /> {user.location}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-7 border-t border-stone-200 pt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
                  About
                </h3>
                <p className="mt-3 max-w-2xl whitespace-pre-wrap leading-7 text-stone-700">
                  {user.bio || 'No bio added yet.'}
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(saveProfile)} className="space-y-5" noValidate>
              <label className="block text-sm font-medium">
                Name
                <input
                  type="text"
                  disabled={isSubmitting}
                  className={inputClassName}
                  {...register('displayName')}
                />
                <FieldError message={errors.displayName?.message} />
              </label>
              <label className="block text-sm font-medium">
                Email
                <input
                  type="email"
                  value={user.email}
                  disabled
                  readOnly
                  className={inputClassName}
                />
                <span className="mt-1.5 block text-xs text-stone-500">
                  Email cannot be changed here.
                </span>
              </label>
              <label className="block text-sm font-medium">
                Avatar URL
                <input
                  type="url"
                  disabled={isSubmitting}
                  placeholder="https://example.com/avatar.jpg"
                  className={inputClassName}
                  {...register('avatar')}
                />
                <FieldError message={errors.avatar?.message} />
              </label>
              <label className="block text-sm font-medium">
                Short bio
                <textarea
                  rows="4"
                  disabled={isSubmitting}
                  className={inputClassName}
                  {...register('bio')}
                />
                <FieldError message={errors.bio?.message} />
              </label>
              <label className="block text-sm font-medium">
                Location
                <input
                  type="text"
                  disabled={isSubmitting}
                  className={inputClassName}
                  {...register('location')}
                />
                <FieldError message={errors.location?.message} />
              </label>
              <div className="flex flex-col-reverse gap-3 border-t border-stone-200 pt-6 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={isSubmitting}
                  className="rounded-sm border border-stone-300 px-5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-sm bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:bg-stone-400"
                >
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="mt-6 flex flex-col gap-4 border-y border-stone-200 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <UserRound size={20} className="text-stone-500" aria-hidden="true" />
            <div>
              <p className="font-medium">Session</p>
              <p className="text-sm text-stone-500">Sign out from this browser.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-fit rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:text-stone-400"
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>
        {logoutError ? (
          <p className="mt-4 text-sm text-red-700" role="alert">{logoutError}</p>
        ) : null}
      </main>
    </div>
  )
}
