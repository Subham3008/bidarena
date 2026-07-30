const wholeCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const decimalCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  currencyDisplay: 'narrowSymbol',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const scientificCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  currencyDisplay: 'narrowSymbol',
  notation: 'scientific',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const DEFAULT_EXTREME_VALUE_THRESHOLD = 1_000_000_000_000
const INVALID_CURRENCY_FALLBACK = '—'

function toFiniteCurrencyValue(value) {
  if (typeof value === 'bigint') {
    return value
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return value
}

function formatExactValue(value) {
  return typeof value === 'number' && !Number.isInteger(value)
    ? decimalCurrencyFormatter.format(value)
    : wholeCurrencyFormatter.format(value)
}

export function formatExactCurrency(value) {
  const safeValue = toFiniteCurrencyValue(value)
  return safeValue === null
    ? INVALID_CURRENCY_FALLBACK
    : formatExactValue(safeValue)
}

export function getCurrencyPresentation(
  value,
  { compactThreshold = DEFAULT_EXTREME_VALUE_THRESHOLD } = {},
) {
  const safeValue = toFiniteCurrencyValue(value)

  if (safeValue === null) {
    return {
      display: INVALID_CURRENCY_FALLBACK,
      exact: INVALID_CURRENCY_FALLBACK,
      isCompact: false,
    }
  }

  const exact = formatExactValue(safeValue)
  const shouldCompact =
    typeof safeValue === 'bigint'
      ? safeValue >= BigInt(compactThreshold) || safeValue <= -BigInt(compactThreshold)
      : Math.abs(safeValue) >= compactThreshold

  const compact = shouldCompact
    ? compactCurrencyFormatter.format(safeValue)
    : exact
  const display =
    shouldCompact && compact.length > 24
      ? scientificCurrencyFormatter.format(safeValue)
      : compact

  return {
    display,
    exact,
    isCompact: shouldCompact,
  }
}

export function formatCurrency(value, options) {
  return getCurrencyPresentation(value, options).display
}
