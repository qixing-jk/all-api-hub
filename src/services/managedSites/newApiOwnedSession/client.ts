import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

import {
  NEW_API_OWNED_SESSION_ACTIONS,
  type NewApiOwnedSessionBundle,
  type NewApiOwnedSessionResponse,
} from "./contracts"

const logger = createLogger("NewApiOwnedSessionClient")

/** Sends one non-retrying ownership command without breaking the caller. */
async function sendBestEffort(message: unknown) {
  try {
    const response = await sendRuntimeMessage<NewApiOwnedSessionResponse>(
      message,
      {
        maxAttempts: 1,
      },
    )
    return response ?? ({ success: false } as const)
  } catch (error) {
    logger.warn("New API owned-session background request failed", { error })
    return { success: false } as const
  }
}

export const captureNewApiOwnedSession = (bundle: NewApiOwnedSessionBundle) =>
  sendBestEffort({
    action: NEW_API_OWNED_SESSION_ACTIONS.Capture,
    bundle,
  })

export const refreshNewApiOwnedSession = (bundle: NewApiOwnedSessionBundle) =>
  sendBestEffort({
    action: NEW_API_OWNED_SESSION_ACTIONS.Refresh,
    bundle,
  })

export const touchNewApiOwnedSession = (baseUrl: string, sessionId?: string) =>
  sendBestEffort({
    action: NEW_API_OWNED_SESSION_ACTIONS.Touch,
    baseUrl,
    sessionId,
  })

/** Reports whether the background registry owns a session for an origin. */
export async function getNewApiOwnedSessionStatus(baseUrl: string) {
  const response = await sendBestEffort({
    action: NEW_API_OWNED_SESSION_ACTIONS.GetStatus,
    baseUrl,
  })
  return { owned: response.success && response.owned === true }
}

/** Requests exact cleanup of every extension-owned SID for an origin. */
export async function cleanupNewApiOwnedSession(baseUrl: string) {
  const response = await sendBestEffort({
    action: NEW_API_OWNED_SESSION_ACTIONS.Cleanup,
    baseUrl,
  })
  return response.success
    ? { status: response.status ?? ("failed" as const) }
    : { status: "failed" as const }
}
