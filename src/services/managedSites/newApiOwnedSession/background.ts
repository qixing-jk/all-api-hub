import { fetchApiResponse } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types"
import {
  clearAlarm,
  createAlarm,
  getSessionStorageValues,
  hasSessionStorageArea,
  onAlarm,
  setSessionStorageValues,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

import {
  NEW_API_OWNED_SESSION_ACTIONS,
  type NewApiOwnedSessionRequest,
  type NewApiOwnedSessionResponse,
} from "./contracts"
import {
  createNewApiOwnedSessionLifecycle,
  type NewApiOwnedSessionReceipt,
} from "./lifecycle"

const logger = createLogger("NewApiOwnedSessionBackground")
const STORAGE_KEY = "new_api_owned_session_receipts_v1"
let memoryFallback: unknown

/** Reads the ephemeral registry with an in-memory compatibility fallback. */
async function readStoredReceipts() {
  if (!hasSessionStorageArea()) return memoryFallback
  const result = await getSessionStorageValues(STORAGE_KEY)
  return result?.[STORAGE_KEY]
}

/** Writes the ephemeral registry without falling back to disk storage. */
async function writeStoredReceipts(value: unknown) {
  if (!(await setSessionStorageValues({ [STORAGE_KEY]: value }))) {
    memoryFallback = value
  }
}

/**
 * Revokes only the SID recorded from the extension's own fresh login; it never
 * calls the upstream revoke-others operation.
 * https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/docs/authentication.md
 */
export async function revokeNewApiOwnedSession(
  receipt: NewApiOwnedSessionReceipt,
) {
  const endpoint = `/api/user/sessions/${encodeURIComponent(receipt.sessionId)}`
  try {
    const response = await fetchApiResponse<string>(
      {
        baseUrl: receipt.origin,
        accountId: `managed-site:new-api-owned-session:${receipt.origin}`,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: receipt.accessToken,
        },
      },
      {
        endpoint,
        responseType: "text",
        currentTabTransport: "disabled",
        tempWindowFallback: { statusCodes: [], codes: [] },
        options: {
          method: "DELETE",
        },
      },
    )

    if (response.ok || response.status === 404) {
      return { status: "cleaned" as const }
    }
    if (response.status === 401) {
      return { status: "unavailable" as const }
    }
    return { status: "retry" as const }
  } catch (error) {
    logger.warn("Exact New API owned-session cleanup failed", {
      status: "transport-error",
      error,
    })
    return { status: "retry" as const }
  }
}

export const newApiOwnedSessionLifecycle = createNewApiOwnedSessionLifecycle({
  now: () => Date.now(),
  readStoredReceipts,
  writeStoredReceipts,
  createAlarm: async (name, info) => await createAlarm(name, info),
  clearAlarm,
  onAlarm,
  reportError: (error) =>
    logger.warn("New API owned-session alarm cleanup failed", { error }),
  revokeSession: revokeNewApiOwnedSession,
})

/** Executes the validated runtime command behind the background-owned seam. */
export async function handleNewApiOwnedSessionRequest(
  request: NewApiOwnedSessionRequest,
): Promise<NewApiOwnedSessionResponse> {
  switch (request.action) {
    case NEW_API_OWNED_SESSION_ACTIONS.Capture:
      await newApiOwnedSessionLifecycle.capture(request.bundle)
      return { success: true }
    case NEW_API_OWNED_SESSION_ACTIONS.Refresh:
      return {
        success: true,
        ...(await newApiOwnedSessionLifecycle.refresh(request.bundle)),
      }
    case NEW_API_OWNED_SESSION_ACTIONS.Touch:
      return {
        success: true,
        ...(await newApiOwnedSessionLifecycle.touch(
          request.baseUrl,
          request.sessionId,
        )),
      }
    case NEW_API_OWNED_SESSION_ACTIONS.GetStatus:
      return {
        success: true,
        ...(await newApiOwnedSessionLifecycle.getStatus(request.baseUrl)),
      }
    case NEW_API_OWNED_SESSION_ACTIONS.Cleanup:
      return {
        success: true,
        ...(await newApiOwnedSessionLifecycle.cleanup(request.baseUrl)),
      }
  }
}
