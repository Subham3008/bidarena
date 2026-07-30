import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { AuthShell } from '../components/AuthShell.jsx'
import { FormField } from '../components/FormField.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getApiErrorMessage } from '../services/api.js'

const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Enter at least 2 characters')
      .max(60, 'Enter at most 60 characters'),
    email: z.string().trim().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(72, 'Use at most 72 characters'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export function RegisterPage() {
  const { register: registerUser } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(values) {
    setServerError('')

    try {
      await registerUser({
        displayName: values.displayName,
        email: values.email,
        password: values.password,
      })
      navigate('/account', { replace: true })
    } catch (error) {
      setServerError(
        getApiErrorMessage(error, 'Registration failed. Please try again.'),
      )
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description="Register to take part in BidArena auctions."
      alternateText="Already have an account?"
      alternateLink={{ to: '/login', label: 'Sign in' }}
    >
      <form
        className="space-y-5"
        onSubmit={handleSubmit(onSubmit)}
        aria-busy={isSubmitting}
        noValidate
      >
        <span className="sr-only" role="status" aria-live="polite">
          {isSubmitting ? 'Creating your account…' : ''}
        </span>
        <FormField
          label="Display name"
          type="text"
          autoComplete="name"
          required
          disabled={isSubmitting}
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <FormField
          label="Email address"
          type="email"
          autoComplete="email"
          required
          disabled={isSubmitting}
          error={errors.email?.message}
          {...register('email')}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="Use 8–72 characters."
          required
          disabled={isSubmitting}
          error={errors.password?.message}
          {...register('password')}
        />
        <FormField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          disabled={isSubmitting}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        {serverError ? (
          <p
            className="feedback-error px-3 py-2.5 text-sm"
            role="alert"
          >
            {serverError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full"
        >
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  )
}
