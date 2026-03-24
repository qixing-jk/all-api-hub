import {
  ApiError,
  isTempWindowUnsupportedErrorCode,
} from "~/services/apiService/common/errors"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

const DEFAULT_MANAGED_VERIFICATION_ERROR_KEY =
  "newApiManagedVerification:dialog.body.failure"

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
export function getNewApiManagedVerificationErrorMessage(error: unknown) {
  if (isNewApiManagedVerificationWindowError(error)) {
    return t("messages:background.windowCreationUnavailable")
  }

  const fallbackMessage = t(DEFAULT_MANAGED_VERIFICATION_ERROR_KEY)
  return getSafeManagedVerificationErrorMessage(error) ?? fallbackMessage
}
