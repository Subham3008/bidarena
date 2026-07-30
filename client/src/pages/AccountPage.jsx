import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarDays,
  LockKeyhole,
  MapPin,
  Pencil,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

function formatMemberSince(value) {
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString([], {
        month: 'long',
        year: 'numeric',
      })
}

function getAvatarPreviewUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

export function AccountPage() {
  const { user, logout, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(user.avatar ?? '')
  const editButtonRef = useRef(null)
  const shouldRestoreEditFocusRef = useRef(false)
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
  const bio = watch('bio')
  const avatarField = register('avatar')

  useEffect(() => {
    if (isEditing) {
      document.getElementById('profile-name')?.focus()
      return
    }

    if (shouldRestoreEditFocusRef.current) {
      shouldRestoreEditFocusRef.current = false
      editButtonRef.current?.focus()
    }
  }, [isEditing])

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
      setAvatarPreviewUrl(updatedUser.avatar ?? '')
      shouldRestoreEditFocusRef.current = true
      setIsEditing(false)
      toast.success('Profile updated successfully')
    } catch (error) {
      const details = error.response?.data?.error?.details ?? []
      let hasMappedFieldError = false

      for (const detail of details) {
        if (detail.field in values) {
          hasMappedFieldError = true
          setError(detail.field, { type: 'server', message: detail.message })
        }
      }

      if (!hasMappedFieldError) {
        const message = getApiErrorMessage(
          error,
          'Profile could not be updated. Please try again.',
        )
        setSaveError(message)
      }
    }
  }

  function startEditing() {
    setSaveError('')
    setAvatarPreviewUrl(user.avatar ?? '')
    setIsEditing(true)
  }

  function cancelEditing() {
    reset({
      displayName: user.displayName,
      avatar: user.avatar ?? '',
      bio: user.bio ?? '',
      location: user.location ?? '',
    })
    setAvatarPreviewUrl(user.avatar ?? '')
    setSaveError('')
    shouldRestoreEditFocusRef.current = true
    setIsEditing(false)
  }

  const inputClassName =
    'field-control mt-2 placeholder:text-stone-400'

  return (
    <div className="app-shell">
      <MarketplaceHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-kicker">Your account</p>
            <h1 className="page-title mt-2">Profile</h1>
            <p className="page-description mt-3">
              Manage the public information shown with your BidArena account.
            </p>
          </div>
          {!isEditing ? (
            <button
              ref={editButtonRef}
              type="button"
              onClick={startEditing}
              className="btn-secondary w-fit"
            >
              <Pencil size={16} aria-hidden="true" /> Edit profile
            </button>
          ) : null}
        </header>

        <section className="surface-card mt-8 overflow-hidden">
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
              <div className="mt-7 grid gap-6 border-t border-stone-200 pt-6 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
                    About
                  </h3>
                  <p className="mt-3 max-w-2xl whitespace-pre-wrap break-words leading-7 text-stone-700">
                    {user.bio ||
                      'Add a short bio to introduce yourself to other marketplace users.'}
                  </p>
                </div>
                <dl className="surface-muted space-y-4 p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <CalendarDays
                      size={17}
                      className="mt-0.5 shrink-0 text-stone-500"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="font-medium text-stone-900">
                        BidArena member
                      </dt>
                      <dd className="mt-0.5 text-stone-600">
                        Since {formatMemberSince(user.createdAt)}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      size={17}
                      className="mt-0.5 shrink-0 text-emerald-700"
                      aria-hidden="true"
                    />
                    <div>
                      <dt className="font-medium text-stone-900">
                        Active account
                      </dt>
                      <dd className="mt-0.5 text-stone-600">
                        Signed in securely
                      </dd>
                    </div>
                  </div>
                </dl>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(saveProfile)}
              aria-busy={isSubmitting}
              noValidate
            >
              <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)]">
                <aside className="border-b border-stone-200 bg-stone-50 p-6 lg:border-b-0 lg:border-r lg:p-8">
                  <p className="text-sm font-semibold text-stone-900">
                    Avatar preview
                  </p>
                  <div className="mt-4">
                    <Avatar
                      key={avatarPreviewUrl || 'avatar-fallback'}
                      name={previewName || user.displayName}
                      src={avatarPreviewUrl}
                      preview
                    />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-stone-500">
                    Use a public HTTPS image URL. If no image is provided, your
                    initial is shown instead.
                  </p>
                </aside>

                <div className="space-y-5 p-6 sm:p-8">
                  <label className="field-label" htmlFor="profile-name">
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

                  <label className="field-label" htmlFor="profile-email">
                    Email address
                    <div className="relative">
                      <input
                        id="profile-email"
                        type="email"
                        value={user.email}
                        disabled
                        readOnly
                        aria-describedby="profile-email-help"
                        className={`${inputClassName} !pr-10`}
                      />
                      <LockKeyhole
                        size={16}
                        className="absolute right-3 top-5 text-stone-400"
                        aria-hidden="true"
                      />
                    </div>
                    <span
                      id="profile-email-help"
                      className="field-help block"
                    >
                      Your sign-in email cannot be changed here.
                    </span>
                  </label>

                  <label className="field-label" htmlFor="profile-avatar">
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
                      {...avatarField}
                      onBlur={(event) => {
                        avatarField.onBlur(event)
                        setAvatarPreviewUrl(
                          getAvatarPreviewUrl(event.target.value.trim()),
                        )
                      }}
                    />
                    <FieldError
                      id="profile-avatar-error"
                      message={errors.avatar?.message}
                    />
                  </label>

                  <label className="field-label" htmlFor="profile-bio">
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
                      className="field-help flex items-start justify-between gap-3"
                    >
                      <span>Visible on your public marketplace identity.</span>
                      <span>{bio?.length ?? 0}/280</span>
                    </span>
                    <FieldError
                      id="profile-bio-error"
                      message={errors.bio?.message}
                    />
                  </label>

                  <label className="field-label" htmlFor="profile-location">
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
                      className="feedback-error px-3 py-2.5 text-sm"
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
                  className="btn-secondary px-5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isDirty}
                  className="btn-primary px-5"
                >
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="surface-card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
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
            className="btn-secondary w-full sm:w-auto"
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>
        {logoutError ? (
          <p
            className="feedback-error mt-4 px-3 py-2.5 text-sm"
            role="alert"
          >
            {logoutError}
          </p>
        ) : null}
      </main>
    </div>
  )
}
