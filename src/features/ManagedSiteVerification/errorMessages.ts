import {
  ApiError,
  isTempWindowUnsupportedErrorCode,
} from "~/services/apiService/common/errors"
import { t } from "~/utils/i18n/core"

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

  if (error instanceof Error) {
    return error.message
  }

  return String(error ?? "")
}
