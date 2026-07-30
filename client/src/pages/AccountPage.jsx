import { zodResolver } from '@hookform/resolvers/zod'
import { LockKeyhole, MapPin, Pencil, UserRound } from 'lucide-react'
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

function Avatar({ name, src, preview = false }) {
  const [imageFailed, setImageFailed] = useState(false)

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt={preview ? `Avatar preview for ${name}` : `${name}'s avatar`}
        className="h-24 w-24 rounded-full border border-stone-200 bg-stone-100 object-cover"
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <div
      className="grid h-24 w-24 place-items-center rounded-full bg-emerald-50 text-2xl font-semibold text-emerald-800 ring-1 ring-emerald-200"
      aria-label={preview ? `Avatar preview for ${name}` : `${name}'s avatar`}
      role="img"
    >
      {(name?.trim().slice(0, 1) || 'U').toUpperCase()}
    </div>
  )
}

function FieldError({ id, message }) {
  return message ? (
    <span id={id} className="mt-1.5 block text-sm text-red-700" role="alert">
      {message}
    </span>
  ) : null
}

export function AccountPage() {
  const { user, logout, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [saveError, setSaveError] = useState('')
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user.displayName,
      avatar: user.avatar ?? '',
      bio: user.bio ?? '',
      location: user.location ?? '',
    },
  })

  const previewName = watch('displayName')
  const previewAvatar = watch('avatar')
  const bio = watch('bio')

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
    setSaveError('')

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

      const message = getApiErrorMessage(
        error,
        'Profile could not be updated. Please try again.',
      )
      setSaveError(message)
      toast.error(message)
    }
  }

  function startEditing() {
    setSaveError('')
    setIsEditing(true)
  }

  function cancelEditing() {
    reset({
      displayName: user.displayName,
      avatar: user.avatar ?? '',
      bio: user.bio ?? '',
      location: user.location ?? '',
    })
    setSaveError('')
    setIsEditing(false)
  }

  const inputClassName =
    'mt-2 w-full rounded-sm border border-stone-300 bg-white px-3 py-2.5 text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500'

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <MarketplaceHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Your account</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Profile</h1>
            <p className="mt-2 max-w-xl text-stone-600">
              Manage the public information shown with your BidArena account.
            </p>
          </div>
          {!isEditing ? (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex w-fit items-center gap-2 rounded-sm border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold transition hover:border-emerald-700 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            >
              <Pencil size={16} aria-hidden="true" /> Edit profile
            </button>
          ) : null}
        </header>

        <section className="mt-8 overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm">
          {!isEditing ? (
            <div className="p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <Avatar name={user.displayName} src={user.avatar} />
                <div className="min-w-0">
                  <h2 className="break-words text-2xl font-semibold">
                    {user.displayName}
                  </h2>
                  <p className="mt-1 break-all text-stone-600">{user.email}</p>
                  {user.location ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-stone-500">
                      <MapPin size={16} className="shrink-0" aria-hidden="true" />
                      <span className="break-words">{user.location}</span>
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-7 border-t border-stone-200 pt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
                  About
                </h3>
                <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words leading-7 text-stone-700">
                  {user.bio || 'Add a short bio to introduce yourself to other marketplace users.'}
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(saveProfile)} noValidate>
              <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)]">
                <aside className="border-b border-stone-200 bg-stone-50 p-6 lg:border-b-0 lg:border-r lg:p-8">
                  <p className="text-sm font-semibold text-stone-900">
                    Avatar preview
                  </p>
                  <div className="mt-4">
                    <Avatar
                      key={previewAvatar || 'avatar-fallback'}
                      name={previewName || user.displayName}
                      src={previewAvatar}
                      preview
                    />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-stone-500">
                    Use a public HTTPS image URL. If no image is provided, your
                    initial is shown instead.
                  </p>
                </aside>

                <div className="space-y-5 p-6 sm:p-8">
                  <label className="block text-sm font-medium" htmlFor="profile-name">
                    Display name{' '}
                    <span className="text-red-700" aria-hidden="true">*</span>
                    <input
                      id="profile-name"
                      type="text"
                      autoComplete="name"
                      required
                      aria-invalid={Boolean(errors.displayName)}
                      aria-describedby={
                        errors.displayName ? 'profile-name-error' : undefined
                      }
                      disabled={isSubmitting}
                      className={inputClassName}
                      {...register('displayName')}
                    />
                    <FieldError
                      id="profile-name-error"
                      message={errors.displayName?.message}
                    />
                  </label>

                  <label className="block text-sm font-medium" htmlFor="profile-email">
                    Email address
                    <div className="relative">
                      <input
                        id="profile-email"
                        type="email"
                        value={user.email}
                        disabled
                        readOnly
                        aria-describedby="profile-email-help"
                        className={`${inputClassName} pr-10`}
                      />
                      <LockKeyhole
                        size={16}
                        className="absolute right-3 top-5 text-stone-400"
                        aria-hidden="true"
                      />
                    </div>
                    <span
                      id="profile-email-help"
                      className="mt-1.5 block text-xs text-stone-500"
                    >
                      Your sign-in email cannot be changed here.
                    </span>
                  </label>

                  <label className="block text-sm font-medium" htmlFor="profile-avatar">
                    Avatar URL
                    <input
                      id="profile-avatar"
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      aria-invalid={Boolean(errors.avatar)}
                      aria-describedby={
                        errors.avatar ? 'profile-avatar-error' : undefined
                      }
                      disabled={isSubmitting}
                      placeholder="https://example.com/avatar.jpg"
                      className={inputClassName}
                      {...register('avatar')}
                    />
                    <FieldError
                      id="profile-avatar-error"
                      message={errors.avatar?.message}
                    />
                  </label>

                  <label className="block text-sm font-medium" htmlFor="profile-bio">
                    Short bio
                    <textarea
                      id="profile-bio"
                      rows="4"
                      aria-invalid={Boolean(errors.bio)}
                      aria-describedby={
                        errors.bio
                          ? 'profile-bio-help profile-bio-error'
                          : 'profile-bio-help'
                      }
                      disabled={isSubmitting}
                      className={`${inputClassName} resize-y`}
                      {...register('bio')}
                    />
                    <span
                      id="profile-bio-help"
                      className="mt-1.5 flex items-start justify-between gap-3 text-xs text-stone-500"
                    >
                      <span>Visible on your public marketplace identity.</span>
                      <span>{bio?.length ?? 0}/280</span>
                    </span>
                    <FieldError
                      id="profile-bio-error"
                      message={errors.bio?.message}
                    />
                  </label>

                  <label className="block text-sm font-medium" htmlFor="profile-location">
                    Location
                    <input
                      id="profile-location"
                      type="text"
                      autoComplete="address-level2"
                      aria-invalid={Boolean(errors.location)}
                      aria-describedby={
                        errors.location ? 'profile-location-error' : undefined
                      }
                      disabled={isSubmitting}
                      placeholder="City, region"
                      className={inputClassName}
                      {...register('location')}
                    />
                    <FieldError
                      id="profile-location-error"
                      message={errors.location?.message}
                    />
                  </label>

                  {saveError ? (
                    <p
                      className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                      role="alert"
                    >
                      {saveError}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-stone-200 bg-stone-50 px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={isSubmitting}
                  className="rounded-sm border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold transition hover:border-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isDirty}
                  className="rounded-sm bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="mt-6 flex flex-col gap-4 rounded-md border border-stone-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600">
              <UserRound size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-medium">Current session</h2>
              <p className="text-sm text-stone-500">Sign out from this browser.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-fit rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-semibold transition hover:border-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>
        {logoutError ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {logoutError}
          </p>
        ) : null}
      </main>
    </div>
  )
}
