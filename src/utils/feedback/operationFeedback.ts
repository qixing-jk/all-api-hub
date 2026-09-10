import notify from "~/lib/notify"
import { t } from "~/utils/i18n/core"

export type OperationResult = {
  success: boolean
  message?: string
  successFallback?: string
  errorFallback?: string
}

/** Maps an operation result to feedback, with explicit or localized fallback copy. */
export function showResultToast({
  success,
  message,
  successFallback,
  errorFallback,
}: OperationResult): void {
  const fallback = success ? successFallback : errorFallback
  notify[success ? "success" : "error"](
    message?.trim() ||
      fallback?.trim() ||
      (success
        ? t("messages:toast.success.operationCompleted")
        : t("messages:toast.error.operationFailedGeneric")),
  )
}
