import { useId } from 'react'

export function FormField({
  label,
  error,
  hint,
  required = false,
  id,
  className = '',
  ...inputProps
}) {
  const generatedId = useId()
  const inputId = id ?? `field-${generatedId}`
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const describedBy = [
    inputProps['aria-describedby'],
    hint ? hintId : '',
    error ? errorId : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className="field-label" htmlFor={inputId}>
      <span>
        {label}
        {required ? (
          <>
            {' '}
            <span className="text-red-700" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> required</span>
          </>
        ) : null}
      </span>
      <input
        {...inputProps}
        id={inputId}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className={`field-control mt-2 ${className}`}
      />
      {hint ? (
        <span id={hintId} className="field-help block font-normal">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          id={errorId}
          className="mt-1.5 block text-sm font-normal text-red-700"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </label>
  )
}
