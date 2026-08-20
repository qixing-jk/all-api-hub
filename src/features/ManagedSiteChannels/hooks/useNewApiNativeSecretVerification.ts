import { useCallback, useEffect, useRef } from "react"

import {
  NEW_API_MANAGED_VERIFICATION_CLOSE_MODES,
  useNewApiManagedVerification,
} from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { NewApiConfig } from "~/types/newApiConfig"

type UseNewApiNativeSecretVerificationOptions = {
  enabled: boolean
  config?: NewApiConfig
}

const abortError = (message: string) => new DOMException(message, "AbortError")

/**
 * Bridges native resource secret reads to New API's interactive session
 * verification without leaking that provider-specific flow into the adapter.
 */
export function useNewApiNativeSecretVerification({
  enabled,
  config,
}: UseNewApiNativeSecretVerificationOptions) {
  const verification = useNewApiManagedVerification()
  const { closeDialog, openNewApiManagedVerification } = verification
  const pendingRead = useRef<((reason?: unknown) => void) | null>(null)

  const cancelPendingRead = useCallback((reason?: unknown) => {
    pendingRead.current?.(reason ?? abortError("Cancelled"))
    pendingRead.current = null
  }, [])

  useEffect(
    () => () => cancelPendingRead(abortError("Unmounted")),
    [cancelPendingRead],
  )

  const runVerifiedRead = useCallback(
    async <T>(
      read: () => Promise<T>,
      label: string,
      signal?: AbortSignal,
    ): Promise<T> => {
      try {
        return await read()
      } catch (error) {
        const verificationRequired =
          error instanceof ManagedResourceError &&
          error.failure.code ===
            MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied &&
          error.failure.recoveryHint ===
            MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS.InteractiveVerification
        if (!enabled || !config || !verificationRequired) throw error
        if (signal?.aborted) {
          throw signal.reason ?? abortError("Aborted")
        }

        return await new Promise<T>((resolve, reject) => {
          let settled = false
          const finish = (callback: () => void) => {
            if (settled) return
            settled = true
            signal?.removeEventListener("abort", onAbort)
            if (pendingRead.current === rejectPending) {
              pendingRead.current = null
            }
            callback()
          }
          const rejectPending = (reason?: unknown) =>
            finish(() => reject(reason ?? abortError("Aborted")))
          const onAbort = () => rejectPending(signal?.reason)

          if (pendingRead.current) {
            cancelPendingRead(abortError("Superseded"))
            closeDialog()
          }
          pendingRead.current = rejectPending
          signal?.addEventListener("abort", onAbort, { once: true })
          openNewApiManagedVerification({
            kind: "channel",
            label,
            config,
            closeMode:
              NEW_API_MANAGED_VERIFICATION_CLOSE_MODES.CLOSE_AFTER_CALLBACK,
            onVerified: async () => {
              try {
                const value = await read()
                finish(() => resolve(value))
              } catch (retryError) {
                rejectPending(retryError)
                throw retryError
              }
            },
          })
        })
      }
    },
    [
      cancelPendingRead,
      config,
      closeDialog,
      enabled,
      openNewApiManagedVerification,
    ],
  )

  const closeVerification = useCallback(() => {
    cancelPendingRead()
    closeDialog()
  }, [cancelPendingRead, closeDialog])

  return { verification, runVerifiedRead, closeVerification }
}
