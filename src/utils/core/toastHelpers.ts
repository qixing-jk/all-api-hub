import { createElement } from "react"
import toast, { type ToastOptions } from "react-hot-toast"

import type { WarningToastAction } from "~/components/toast/types"
import { WarningToast } from "~/components/toast/WarningToast"
import { WarningToastIcon } from "~/components/toast/WarningToastIcon"
import type { PreferenceSaveOptions } from "~/contexts/UserPreferencesContext"
import type {
  PreferenceWriteFailure,
  PreferenceWriteResult,
} from "~/services/preferences/userPreferences"
import { t } from "~/utils/i18n/core"

type ToastResultObject = {
  success: boolean
  message?: string
  successFallback?: string
  errorFallback?: string
}

type ToastParams =
  | [success: boolean, successMsg?: string, errorMsg?: string]
  | [result: ToastResultObject]

const normalizeToastMessage = (message?: string) => {
  const trimmed = message?.trim()
  return trimmed ? trimmed : null
}

const getDefaultToastMessage = (success: boolean) =>
  success
    ? t("messages:toast.success.operationCompleted")
    : t("messages:toast.error.operationFailedGeneric")

const WARNING_TOAST_DEFAULTS: ToastOptions = {
  duration: 5000,
}

type WarningToastOptions = ToastOptions & {
  action?: WarningToastAction
}

type WarningToastFallbackApi = {
  success?: (message: string) => void
  custom?: (
    renderer: (toastInstance: any) => ReturnType<typeof createElement>,
    options?: ToastOptions,
  ) => void
}

/**
 * Shows a toast notification based on the success status of an operation.
 */
export function showResultToast(...args: ToastParams): void {
  if (typeof args[0] === "boolean") {
    // 兼容旧逻辑
    const [success, successMsg, errorMsg] = args
    const message = normalizeToastMessage(success ? successMsg : errorMsg)
    toast[success ? "success" : "error"](
      message || getDefaultToastMessage(success),
    )
  } else {
    // 支持对象参数
    const { success, message, successFallback, errorFallback } = args[0]
    const normalizedMessage = normalizeToastMessage(message)
    const fallbackMessage = normalizeToastMessage(
      success ? successFallback : errorFallback,
    )

    toast[success ? "success" : "error"](
      normalizedMessage || fallbackMessage || getDefaultToastMessage(success),
    )
  }
}

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
  if (failure.type === "stale") {
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
    showResultToast(true, successMsg)
    return
  }

  toast.error(getPreferenceWriteFailureMessage(result.reason, { setting }))
}

const isPreferenceWriteResult = (
  value: boolean | PreferenceWriteResult | ToastResultObject,
): value is PreferenceWriteResult =>
  typeof value === "object" && value !== null && "ok" in value

const isToastResultObject = (
  value: boolean | PreferenceWriteResult | ToastResultObject,
): value is ToastResultObject =>
  typeof value === "object" && value !== null && "success" in value

/**
 * Shows a toast notification for an update operation.
 * @param result - Whether the update succeeded, or a structured mutation result.
 * @param setting - The name of the setting that was updated.
 */
export const showUpdateToast = (
  result: boolean | PreferenceWriteResult | ToastResultObject,
  setting: string,
): void => {
  if (isPreferenceWriteResult(result)) {
    showPreferenceWriteResultToast(result, setting)
    return
  }

  const successMsg = t("settings:messages.updateSuccess", { name: setting })
  const errorMsg = t("settings:messages.updateFailed", { name: setting })

  if (isToastResultObject(result)) {
    showResultToast({
      success: result.success,
      message: result.message,
      successFallback: result.successFallback ?? successMsg,
      errorFallback: result.errorFallback ?? errorMsg,
    })
    return
  }

  showResultToast(result, successMsg, errorMsg)
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
 * Creates versioned save options for callers that have custom success/error UI.
 */
export function createVersionedPreferenceSaveOptions(
  expectedLastUpdated: number,
): PreferenceSaveOptions {
  return {
    expectedLastUpdated,
  }
}

/**
 * Shows a toast notification for a reset operation.
 * @param success - Whether the reset was successful.
 */
export const showResetToast = (success: boolean): void => {
  const successMsg = t("settings:messages.updateSuccess")
  const errorMsg = t("settings:danger.resetFailed")
  showResultToast(success, successMsg, errorMsg)
}

/**
 * Shows a warning-style toast using the generic toast container so callers can
 * reuse a consistent non-error, non-success feedback treatment.
 * @param message - The warning message to display.
 * @param options - Optional toast overrides.
 */
export const showWarningToast = (
  message: string,
  options?: WarningToastOptions,
): void => {
  const normalizedMessage = normalizeToastMessage(message)
  if (!normalizedMessage) return
  const toastRuntime = toast as unknown
  const toastApi = toastRuntime as WarningToastFallbackApi
  const callableToast = toastRuntime as
    | ((
        message: string,
        options?: ToastOptions & { icon?: ReturnType<typeof createElement> },
      ) => void)
    | undefined

  const mergedOptions = {
    ...WARNING_TOAST_DEFAULTS,
    ...options,
  }

  if (typeof toastApi.custom === "function") {
    toastApi.custom(
      (toastInstance) =>
        createElement(WarningToast, {
          toastInstance,
          message: normalizedMessage,
          action: options?.action,
        }),
      mergedOptions,
    )
    return
  }

  // Compatibility fallback for simplified test mocks or environments that do
  // not expose toast.custom. Runtime in this repo uses react-hot-toast with
  // toast.custom available, so this path is only a graceful downgrade.
  if (typeof toastRuntime === "function" && callableToast) {
    callableToast(normalizedMessage, {
      ...mergedOptions,
      icon: createElement(WarningToastIcon),
    })
    return
  }

  if (typeof toastApi.success === "function") {
    toastApi.success(normalizedMessage)
  }
}
