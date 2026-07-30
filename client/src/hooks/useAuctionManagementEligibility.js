import { useEffect, useState } from 'react'

const MAX_TIMEOUT_MS = 2_147_000_000

export function useAuctionManagementEligibility(auction) {
  const [eligibilityClock, setEligibilityClock] = useState(() => Date.now())
  const startTime = new Date(auction?.startAt).getTime()
  const isUpcoming = auction?.status === 'UPCOMING'

  useEffect(() => {
    if (!isUpcoming || !Number.isFinite(startTime)) {
      return undefined
    }

    const delay = startTime - Date.now()

    if (delay <= 0) {
      return undefined
    }

    const timeout = setTimeout(
      () => setEligibilityClock(Date.now()),
      Math.min(delay + 25, MAX_TIMEOUT_MS),
    )

    return () => clearTimeout(timeout)
  }, [eligibilityClock, isUpcoming, startTime])

  return (
    isUpcoming &&
    Number.isFinite(startTime) &&
    startTime > Math.max(eligibilityClock, Date.now()) &&
    Number(auction?.bidCount) === 0
  )
}
