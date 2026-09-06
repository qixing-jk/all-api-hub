import type { TFunction } from "i18next"

import {
  ApiError,
  isTempWindowUnsupportedErrorCode,
} from "~/services/apiTransport/errors"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

const DEFAULT_MANAGED_VERIFICATION_ERROR_KEY =
  "newApiManagedVerification:dialog.body.failure"

export type NewApiManagedVerificationFailure =
  | { kind: "window-unavailable" | "unknown" }
  | { kind: "message"; message: string }

/**
 * Collapses obviously unusable error payloads so the dialog can fall back to
 * stable localized copy instead of rendering blank/object-like text.
 */
function getSafeManagedVerificationErrorMessage(error: unknown): string | null {
  const normalized = getErrorMessage(error).replace(/\s+/g, " ").trim()
  const looksLikeStructuredPayload =
    (normalized.startsWith("{") && normalized.endsWith("}")) ||
    (normalized.startsWith("[") && normalized.endsWith("]"))

  if (
    !normalized ||
    normalized === "[object Object]" ||
    normalized === "undefined" ||
    normalized === "null" ||
    looksLikeStructuredPayload
  ) {
    return null
  }

  return normalized
}

/**
 * Detects temp-context failures that should be surfaced as localized browser
 * window guidance in the managed verification UI.
 */
export function isNewApiManagedVerificationWindowError(
  error: unknown,
): error is ApiError {
  return (
    error instanceof ApiError && isTempWindowUnsupportedErrorCode(error.code)
  )
}

/**
 * Normalizes managed verification errors into user-facing copy.
 */
export function getNewApiManagedVerificationFailure(
  error: unknown,
): NewApiManagedVerificationFailure {
  if (isNewApiManagedVerificationWindowError(error)) {
    return { kind: "window-unavailable" }
  }
  const message = getSafeManagedVerificationErrorMessage(error)
  return message ? { kind: "message", message } : { kind: "unknown" }
}

/** Renders controlled failures using the active UI translator. */
export function presentNewApiManagedVerificationFailure(
  failure: NewApiManagedVerificationFailure,
  t: TFunction,
) {
  if (failure.kind === "window-unavailable")
    return t("messages:background.windowCreationUnavailable")
  if (failure.kind === "message") return failure.message
  return t(DEFAULT_MANAGED_VERIFICATION_ERROR_KEY)
}

/** Resolves an immediate notification without retaining localized fallback copy. */
export function getNewApiManagedVerificationErrorMessage(error: unknown) {
  return presentNewApiManagedVerificationFailure(
    getNewApiManagedVerificationFailure(error),
    t,
  )
}
