import {
  createRuntimeMessageFailure,
  type RuntimeMessageFailure,
} from "~/services/runtimeMessaging/result"
import {
  isMessageReceiverUnavailableError,
  type SendMessageRetryOptions,
} from "~/utils/browser/browserApi"

import {
  ReleaseUpdateMessageTypes,
  sendReleaseUpdateMessage,
  type ReleaseUpdateRuntimeResponse,
} from "./messaging"
import { parseReleaseUpdateStatus } from "./statusCodec"

type ReleaseUpdateMessageType =
  (typeof ReleaseUpdateMessageTypes)[keyof typeof ReleaseUpdateMessageTypes]

/**
 * Normalize runtime failures into the shared response shape.
 */
function toFailureResponse(error: string): RuntimeMessageFailure {
  return createRuntimeMessageFailure(error)
}

/**
 * Preserve the existing transient receiver retry behavior for typed release
 * update messages.
 */
async function sendReleaseUpdateMessageWithRetry(
  type: ReleaseUpdateMessageType,
  options?: SendMessageRetryOptions,
): Promise<unknown> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3)
  const delayMs = options?.delayMs ?? 500

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await sendReleaseUpdateMessage(type)
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

  throw new Error("sendReleaseUpdateMessageWithRetry: exhausted retries")
}

/**
 * Send a typed release-update request to background and normalize its response.
 */
async function requestReleaseUpdateAction(
  type: ReleaseUpdateMessageType,
  options?: SendMessageRetryOptions,
): Promise<ReleaseUpdateRuntimeResponse> {
  let response: unknown

  try {
    response = await sendReleaseUpdateMessageWithRetry(type, options)
  } catch (error) {
    return toFailureResponse(
      error instanceof Error && error.message
        ? error.message
        : "Background request failed.",
    )
  }

  if (!response || typeof response !== "object") {
    return toFailureResponse("No response from background.")
  }

  const record = response as Record<string, unknown>
  if (record.success === false) {
    const error = record.error
    return toFailureResponse(
      typeof error === "string" && error ? error : "Background request failed.",
    )
  }

  if (record.success === true) {
    const status = parseReleaseUpdateStatus(record.data)
    if (status) {
      return {
        success: true,
        data: status,
      }
    }
  }

  return toFailureResponse("Invalid response from background.")
}

/**
 * Read the cached release-update status from the background service.
 */
export async function requestReleaseUpdateStatus(
  options?: SendMessageRetryOptions,
): Promise<ReleaseUpdateRuntimeResponse> {
  return await requestReleaseUpdateAction(
    ReleaseUpdateMessageTypes.GetStatus,
    options,
  )
}

/**
 * Force an immediate release-update check via the background service.
 */
export async function requestReleaseUpdateCheckNow(
  options?: SendMessageRetryOptions,
): Promise<ReleaseUpdateRuntimeResponse> {
  return await requestReleaseUpdateAction(
    ReleaseUpdateMessageTypes.CheckNow,
    options,
  )
}
