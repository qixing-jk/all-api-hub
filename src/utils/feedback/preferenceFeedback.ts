import type { PreferenceSaveOptions } from "~/contexts/UserPreferencesContext"
import toast from "~/lib/notify"
import type {
  PreferenceWriteFailure,
  PreferenceWriteResult,
} from "~/services/preferences/userPreferences"
import { PREFERENCE_WRITE_FAILURE_TYPES } from "~/services/preferences/userPreferences"
import {
  showResultToast,
  type OperationResult,
} from "~/utils/feedback/operationFeedback"
import { t } from "~/utils/i18n/core"

type GuardedPreferenceUpdate = (
  options: PreferenceSaveOptions,
) => Promise<PreferenceWriteResult>

type PreferenceUpdateToastOptions = {
  expectedLastUpdated: number
  setting: string
  update: GuardedPreferenceUpdate
}

/**
 * Maps persisted preference write failures to stable local user feedback.
 */
export function getPreferenceWriteFailureMessage(
  failure: PreferenceWriteFailure,
  options?: {
    setting?: string
    fallback?: string
  },
): string {
  if (failure.type === PREFERENCE_WRITE_FAILURE_TYPES.Stale) {
    return t("settings:messages.preferencesChangedExternally")
  }

  if (options?.fallback) {
    return options.fallback
  }

  return options?.setting
    ? t("settings:messages.updateFailed", { name: options.setting })
    : t("messages:toast.error.operationFailedGeneric")
}

/**
 * Shows a toast for a structured preference write result.
 */
function showPreferenceWriteResultToast(
  result: PreferenceWriteResult,
  setting: string,
): void {
  const successMsg = t("settings:messages.updateSuccess", { name: setting })
  if (result.ok) {
    showResultToast({ success: true, message: successMsg })
    return
  }

  toast.error(getPreferenceWriteFailureMessage(result.reason, { setting }))
}

const isPreferenceWriteResult = (
  value: boolean | PreferenceWriteResult | OperationResult,
): value is PreferenceWriteResult =>
  typeof value === "object" && value !== null && "ok" in value

const isOperationResult = (
  value: boolean | PreferenceWriteResult | OperationResult,
): value is OperationResult =>
  typeof value === "object" && value !== null && "success" in value

/**
 * Shows a toast notification for an update operation.
 * @param result - Whether the update succeeded, or a structured mutation result.
 * @param setting - The name of the setting that was updated.
 */
export const showUpdateToast = (
  result: boolean | PreferenceWriteResult | OperationResult,
  setting: string,
): void => {
  if (isPreferenceWriteResult(result)) {
    showPreferenceWriteResultToast(result, setting)
    return
  }

  const successMsg = t("settings:messages.updateSuccess", { name: setting })
  const errorMsg = t("settings:messages.updateFailed", { name: setting })

  if (isOperationResult(result)) {
    showResultToast({
      success: result.success,
      message: result.message,
      successFallback: result.successFallback ?? successMsg,
      errorFallback: result.errorFallback ?? errorMsg,
    })
    return
  }

  showResultToast({
    success: result,
    successFallback: successMsg,
    errorFallback: errorMsg,
  })
}

/**
 * Runs an optimistic-concurrency preference update and shows result-aware
 * feedback for stale snapshots and storage failures.
 */
export async function runPreferenceUpdateWithToast({
  expectedLastUpdated,
  setting,
  update,
}: PreferenceUpdateToastOptions): Promise<PreferenceWriteResult> {
  const result = await update({
    expectedLastUpdated,
  })

  showPreferenceWriteResultToast(result, setting)
  return result
}

/**
 * Shows a toast notification for a reset operation.
 * @param success - Whether the reset was successful.
 */
export const showResetToast = (success: boolean): void => {
  const successMsg = t("settings:messages.updateSuccess")
  const errorMsg = t("settings:danger.resetFailed")
  showResultToast({
    success,
    successFallback: successMsg,
    errorFallback: errorMsg,
  })
}
