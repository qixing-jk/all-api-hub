import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import {
  createRuntimeMessageFailure,
  type RuntimeMessageFailure,
} from "~/services/runtimeMessaging/result"
import {
  isMessageReceiverUnavailableError,
  type SendMessageRetryOptions,
} from "~/utils/browser/browserApi"

/**
 * Typed runtime message types for the LDOH site lookup feature.
 */
export const LdohSiteLookupMessageTypes = {
  RefreshSites: "ldohSiteLookup:refreshSites",
} as const

/**
 * Runtime request to refresh the cached LDOH site directory (background-only work).
 */
type LdohSiteLookupRefreshSitesRequest = Record<string, never>

/**
 * Runtime response for LDOH site directory refresh requests.
 */
export type LdohSiteLookupRefreshSitesResponse =
  | {
      success: true
      cachedCount: number
    }
  | {
      success: false
      unauthenticated?: boolean
      error: string
    }

interface LdohSiteLookupProtocolMap {
  [LdohSiteLookupMessageTypes.RefreshSites](
    data: LdohSiteLookupRefreshSitesRequest,
  ): LdohSiteLookupRefreshSitesResponse
}

const ldohSiteLookupMessaging =
  defineExtensionMessaging<LdohSiteLookupProtocolMap>({
    logger: createRuntimeMessagingLogger("LdohSiteLookupMessaging"),
  })

const sendLdohSiteLookupMessage = ldohSiteLookupMessaging.sendMessage
export const onLdohSiteLookupMessage = ldohSiteLookupMessaging.onMessage

type LdohSiteLookupMessageType =
  (typeof LdohSiteLookupMessageTypes)[keyof typeof LdohSiteLookupMessageTypes]

/**
 * Normalize send failures into the shared runtime response shape.
 */
function toFailureResponse(error: string): RuntimeMessageFailure {
  return createRuntimeMessageFailure(error)
}

/**
 * Preserve transient receiver retry behavior for typed LDOH lookup messages.
 */
async function sendLdohSiteLookupMessageWithRetry(
  type: LdohSiteLookupMessageType,
  data: LdohSiteLookupRefreshSitesRequest,
  options?: SendMessageRetryOptions,
): Promise<unknown> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3)
  const delayMs = options?.delayMs ?? 500

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await sendLdohSiteLookupMessage(type, data)
    } catch (error) {
      const shouldRetry =
        attempt < maxAttempts - 1 && isMessageReceiverUnavailableError(error)

      if (!shouldRetry) {
        throw error
      }

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * Math.pow(2, attempt)),
      )
    }
  }

  throw new Error("sendLdohSiteLookupMessageWithRetry: exhausted retries")
}

/**
 * Requests the background script to refresh the LDOH site directory cache.
 *
 * UI code does not depend on raw runtime message transport details.
 */
export async function requestLdohSiteLookupRefreshSites(
  options?: SendMessageRetryOptions,
): Promise<LdohSiteLookupRefreshSitesResponse> {
  let response: unknown

  try {
    response = await sendLdohSiteLookupMessageWithRetry(
      LdohSiteLookupMessageTypes.RefreshSites,
      {},
      options,
    )
  } catch (error) {
    return toFailureResponse(
      error instanceof Error && error.message
        ? error.message
        : "Background request failed.",
    )
  }

  if (!response || typeof response !== "object") {
    return { success: false, error: "No response from background." }
  }

  const obj = response as Record<string, unknown>

  if (obj.success === true) {
    const cachedCount = obj.cachedCount
    if (
      typeof cachedCount === "number" &&
      Number.isFinite(cachedCount) &&
      cachedCount >= 0
    ) {
      return { success: true, cachedCount }
    }
  }

  if (obj.success === false) {
    const error = obj.error
    if (typeof error === "string" && error) {
      const unauthenticated = obj.unauthenticated
      return {
        success: false,
        unauthenticated:
          typeof unauthenticated === "boolean" ? unauthenticated : undefined,
        error,
      }
    }
  }

  return { success: false, error: "Invalid response from background." }
}
