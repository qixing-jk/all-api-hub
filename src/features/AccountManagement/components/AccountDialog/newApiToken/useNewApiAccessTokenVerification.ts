import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { NEW_API_TOKEN_VALIDATION_STATUSES as VALIDATION_STATUSES } from "~/services/apiService/newApiFamily/accessTokens/protocol"
import {
  validateNewApiAccessToken,
  type NewApiAccessTokenTarget,
  type NewApiAccessTokenValidationResult,
} from "~/services/apiService/newApiFamily/accessTokens/validation"

export const TOKEN_VERIFICATION_CHECKING = "checking"

export type NewApiAccessTokenVerificationStatus =
  | NewApiAccessTokenValidationResult["status"]
  | typeof TOKEN_VERIFICATION_CHECKING

/** Tracks one advisory check at a time for the action that entered the draft. */
export function useNewApiAccessTokenVerification(
  target: NewApiAccessTokenTarget | undefined,
  automaticEntry: NewApiAccessTokenTarget | undefined,
) {
  const [status, setStatus] = useState<NewApiAccessTokenVerificationStatus>()
  const active = useRef<AbortController | null>(null)
  const abortActive = useCallback(() => {
    if (!active.current) return false
    active.current.abort()
    active.current = null
    return true
  }, [])

  useLayoutEffect(() => {
    setStatus(undefined)
    return () => {
      abortActive()
    }
  }, [target, abortActive])

  const verify = useCallback(async (credential: NewApiAccessTokenTarget) => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setStatus(TOKEN_VERIFICATION_CHECKING)
    try {
      const result = await validateNewApiAccessToken({
        ...credential,
        abortSignal: controller.signal,
      })
      if (!controller.signal.aborted) setStatus(result.status)
    } catch {
      if (!controller.signal.aborted) setStatus(VALIDATION_STATUSES.UNAVAILABLE)
    } finally {
      if (active.current === controller) active.current = null
    }
  }, [])

  // The automatic entry remains stable while the user edits the full-form token.
  // Only a new compact entry or an explicit retry starts another check.
  useEffect(() => {
    if (automaticEntry) void verify(automaticEntry)
  }, [automaticEntry, verify])

  const cancel = useCallback(() => {
    if (abortActive()) setStatus(undefined)
  }, [abortActive])

  return {
    status: target ? status : undefined,
    verify: target ? () => void verify(target) : undefined,
    cancel,
  }
}
