import { createContext, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { type ReleaseUpdateStatus } from "~/services/updates/releaseUpdateStatus"
import {
  requestReleaseUpdateCheckNow,
  requestReleaseUpdateStatus,
} from "~/services/updates/runtime"
import { getErrorMessage } from "~/utils/core/error"

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

const RELEASE_UPDATE_REQUEST_ERROR = "Background request failed."

/**
 * Build the shared release-update state used by UI consumers within one app surface.
 */
function useCreateReleaseUpdateStatus(): ReleaseUpdateStatusContextValue {
  const [status, setStatus] = useState<ReleaseUpdateStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const checkInFlightCountRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
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
      } catch (requestError) {
        if (!cancelled) {
          setError(getErrorMessage(requestError, RELEASE_UPDATE_REQUEST_ERROR))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const refresh = async () => {
    try {
      const response = await requestReleaseUpdateStatus()

      if (response.success) {
        setStatus(response.data)
        setError(null)
        return
      }

      setError(response.error)
    } catch (requestError) {
      setError(getErrorMessage(requestError, RELEASE_UPDATE_REQUEST_ERROR))
    }
  }

  const checkNow = async () => {
    checkInFlightCountRef.current += 1
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
    } catch (requestError) {
      setError(getErrorMessage(requestError, RELEASE_UPDATE_REQUEST_ERROR))
      return null
    } finally {
      checkInFlightCountRef.current = Math.max(
        0,
        checkInFlightCountRef.current - 1,
      )
      setIsChecking(checkInFlightCountRef.current > 0)
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
