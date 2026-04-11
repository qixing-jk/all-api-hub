import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  sendRuntimeActionMessage,
  type SendMessageRetryOptions,
} from "~/utils/browser/browserApi"

import { type ReleaseUpdateStatus } from "./releaseUpdateStatus"
import { parseReleaseUpdateStatus } from "./statusCodec"

type ReleaseUpdateRuntimeSuccess = {
  success: true
  data: ReleaseUpdateStatus
}

type ReleaseUpdateRuntimeFailure = {
  success: false
  error: string
}

type ReleaseUpdateRuntimeResponse =
  | ReleaseUpdateRuntimeSuccess
  | ReleaseUpdateRuntimeFailure

/**
 * Normalize runtime failures into the shared response shape.
 */
function toFailureResponse(error: string): ReleaseUpdateRuntimeFailure {
  return { success: false, error }
}

/**
 * Send a release-update action to background and normalize its response.
 */
async function requestReleaseUpdateAction(
  action:
    | typeof RuntimeActionIds.ReleaseUpdateGetStatus
    | typeof RuntimeActionIds.ReleaseUpdateCheckNow,
  options?: SendMessageRetryOptions,
): Promise<ReleaseUpdateRuntimeResponse> {
  let response: unknown

  try {
    response = await sendRuntimeActionMessage(
      {
        action,
      },
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
    RuntimeActionIds.ReleaseUpdateGetStatus,
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
    RuntimeActionIds.ReleaseUpdateCheckNow,
    options,
  )
}
