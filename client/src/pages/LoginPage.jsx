import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { AuthShell } from '../components/AuthShell.jsx'
import { FormField } from '../components/FormField.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getApiErrorMessage } from '../services/api.js'

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export function LoginPage() {
  const { login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function onSubmit(credentials) {
    setServerError('')

    try {
      await login(credentials)
      navigate(location.state?.from ?? '/account', { replace: true })
    } catch (error) {
      setServerError(
        getApiErrorMessage(error, 'Login failed. Please try again.'),
      )
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to continue to your BidArena account."
      alternateText="New to BidArena?"
      alternateLink={{ to: '/register', label: 'Create an account' }}
    >
      <form
        className="space-y-5"
        onSubmit={handleSubmit(onSubmit)}
        aria-busy={isSubmitting}
        noValidate
      >
        <span className="sr-only" role="status" aria-live="polite">
          {isSubmitting ? 'Signing in…' : ''}
        </span>
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
          autoComplete="current-password"
          required
          disabled={isSubmitting}
          error={errors.password?.message}
          {...register('password')}
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
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}
