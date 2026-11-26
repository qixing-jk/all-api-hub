import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { isRecord } from "~/utils/core/object"

import {
  isNewApiTokenOAuthProvider,
  newApiTokenOAuthCallbackPath,
  readTokenOAuthCallback,
  type NewApiTokenOAuthCallback,
} from "./oauth"
import { NEW_API_TOKEN_VERIFICATION_ERRORS as VERIFICATION_ERRORS } from "./protocol"

export const NEW_API_TOKEN_OAUTH_MARKER = "all-api-hub:token-verification"
export const NEW_API_TOKEN_OAUTH_CALLBACK = "newApiTokenOAuthCallback"

export interface NewApiTokenOAuthMarker {
  requestId: string
  provider: string
  state: string
  origin: string
  expiresAt: number
}

/** Capture only this extension's pending verification before a custom site consumes its code. */
export function captureTokenOAuthCallback() {
  let marker: unknown
  try {
    marker = JSON.parse(
      sessionStorage.getItem(NEW_API_TOKEN_OAUTH_MARKER) || "null",
    )
  } catch {
    return
  }
  if (
    !isRecord(marker) ||
    typeof marker.requestId !== "string" ||
    !marker.requestId ||
    !isNewApiTokenOAuthProvider(marker.provider) ||
    typeof marker.state !== "string" ||
    !marker.state ||
    marker.origin !== location.origin ||
    typeof marker.expiresAt !== "number" ||
    !Number.isFinite(marker.expiresAt) ||
    marker.expiresAt <= Date.now()
  )
    return
  const { requestId, origin, provider, state } = marker
  const publish = (
    outcome:
      | { callback: NewApiTokenOAuthCallback }
      | { error: true | typeof VERIFICATION_ERRORS.OAUTH_CANCELLED },
  ) => {
    sessionStorage.removeItem(NEW_API_TOKEN_OAUTH_MARKER)
    history.replaceState(history.state, "", location.pathname)
    void sendRuntimeMessage(
      { action: NEW_API_TOKEN_OAUTH_CALLBACK, requestId, ...outcome },
      { maxAttempts: 1 },
    ).catch(() => undefined)
  }
  try {
    const callback = readTokenOAuthCallback(
      location.href,
      origin,
      provider,
      state,
    )
    if (callback) publish({ callback })
  } catch (error) {
    if (location.pathname !== newApiTokenOAuthCallbackPath(provider)) return
    publish({
      error:
        error instanceof Error &&
        error.message === VERIFICATION_ERRORS.OAUTH_CANCELLED
          ? VERIFICATION_ERRORS.OAUTH_CANCELLED
          : true,
    })
  }
}
