import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  isConfirming = false,
  onCancel,
  onConfirm,
  fallbackFocusRef,
}) {
  const dialogRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const progressRef = useRef(null)
  const isConfirmingRef = useRef(isConfirming)
  const onCancelRef = useRef(onCancel)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const previouslyFocused = document.activeElement
    const fallbackFocus = fallbackFocusRef?.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isConfirmingRef.current) {
        event.preventDefault()
        onCancelRef.current()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]',
      )

      if (!focusableElements?.length) {
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      const focusTarget = previouslyFocused?.isConnected
        ? previouslyFocused
        : fallbackFocus
      focusTarget?.focus()
    }
  }, [fallbackFocusRef, open])

  useEffect(() => {
    isConfirmingRef.current = isConfirming
    onCancelRef.current = onCancel

    if (open && isConfirming) {
      progressRef.current?.focus()
    } else if (open && !dialogRef.current?.contains(document.activeElement)) {
      cancelButtonRef.current?.focus()
    }
  }, [isConfirming, onCancel, open])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-stone-950/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isConfirming) {
          onCancel()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description"
        className="w-full max-w-md border border-stone-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center bg-red-50 text-red-700">
            <AlertTriangle size={20} aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="-mr-2 -mt-2 rounded-sm p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 disabled:cursor-not-allowed"
            aria-label="Close confirmation"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <h2 id="confirmation-title" className="mt-4 text-xl font-semibold text-stone-950">
          {title}
        </h2>
        <p id="confirmation-description" className="mt-2 text-sm leading-6 text-stone-600">
          {description}
        </p>
        {isConfirming ? (
          <p
            ref={progressRef}
            tabIndex="0"
            className="mt-3 text-sm font-medium text-stone-700 outline-none focus:ring-2 focus:ring-emerald-700"
            role="status"
          >
            Deleting auction…
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="rounded-sm border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-800 hover:border-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-stone-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="rounded-sm bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {isConfirming ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
