import { createContext, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"

import { type ReleaseUpdateStatus } from "~/services/updates/releaseUpdateStatus"
import {
  requestReleaseUpdateCheckNow,
  requestReleaseUpdateStatus,
} from "~/services/updates/runtime"

type ReleaseUpdateStatusContextValue = {
  status: ReleaseUpdateStatus | null
  isLoading: boolean
  isChecking: boolean
  error: string | null
  refresh: () => Promise<void>
  checkNow: () => Promise<ReleaseUpdateStatus | null>
}

const ReleaseUpdateStatusContext = createContext<
  ReleaseUpdateStatusContextValue | undefined
>(undefined)

/**
 * Build the shared release-update state used by UI consumers within one app surface.
 */
function useCreateReleaseUpdateStatus(): ReleaseUpdateStatusContextValue {
  const [status, setStatus] = useState<ReleaseUpdateStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const response = await requestReleaseUpdateStatus()
      if (cancelled) {
        return
      }

      if (response.success) {
        setStatus(response.data)
        setError(null)
      } else {
        setError(response.error)
      }

      setIsLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const refresh = async () => {
    const response = await requestReleaseUpdateStatus()

    if (response.success) {
      setStatus(response.data)
      setError(null)
      return
    }

    setError(response.error)
  }

  const checkNow = async () => {
    setIsChecking(true)

    try {
      const response = await requestReleaseUpdateCheckNow()
      if (response.success) {
        setStatus(response.data)
        setError(null)
        return response.data
      }

      setError(response.error)
      return null
    } finally {
      setIsChecking(false)
    }
  }

  return {
    status,
    isLoading,
    isChecking,
    error,
    refresh,
    checkNow,
  }
}

/**
 * Share one release-update request lifecycle across the current app surface.
 */
export function ReleaseUpdateStatusProvider({
  children,
}: {
  children: ReactNode
}) {
  const value = useCreateReleaseUpdateStatus()

  return (
    <ReleaseUpdateStatusContext.Provider value={value}>
      {children}
    </ReleaseUpdateStatusContext.Provider>
  )
}

/**
 * Read shared release-update state provided by the app shell.
 */
export function useReleaseUpdateStatus(): ReleaseUpdateStatusContextValue {
  const value = useContext(ReleaseUpdateStatusContext)

  if (!value) {
    throw new Error(
      "useReleaseUpdateStatus must be used within a ReleaseUpdateStatusProvider",
    )
  }

  return value
}
