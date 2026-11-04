import { CircleAlert, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "./button"

export const SELECT_FETCH_STATUSES = {
  Success: "success",
  Error: "error",
} as const

export type SelectFetchResult =
  | { status: typeof SELECT_FETCH_STATUSES.Success; count: number }
  | { status: typeof SELECT_FETCH_STATUSES.Error; message?: string }

/** Project a completed discovery outcome; zero is a successful empty catalog. */
export function getSelectFetchResult(
  error: string | null | undefined,
  count: number | null,
): SelectFetchResult | null {
  return error
    ? { status: SELECT_FETCH_STATUSES.Error, message: error }
    : count !== null
      ? { status: SELECT_FETCH_STATUSES.Success, count }
      : null
}

const MAX_INLINE_DIAGNOSTIC_LENGTH = 100

/** A failed catalog request does not invalidate the current selected value. */
export function SelectFetchIndicator({
  result,
}: {
  result?: SelectFetchResult | null
}) {
  const { t } = useTranslation("ui")
  if (!result) return null
  const label =
    result.status === SELECT_FETCH_STATUSES.Error
      ? t("searchableSelect.fetchFailed")
      : result.count === 0
        ? t("searchableSelect.fetchEmptyLabel")
        : t("searchableSelect.fetchSuccess", { count: result.count })
  return (
    <span
      aria-label={label}
      title={label}
      className="text-muted-foreground shrink-0 text-xs"
    >
      {result.status === SELECT_FETCH_STATUSES.Error ? (
        <CircleAlert
          aria-hidden="true"
          className="text-warning-indicator size-4"
        />
      ) : result.count === 0 ? (
        t("searchableSelect.fetchEmptyLabel")
      ) : (
        result.count
      )}
    </span>
  )
}

/** Show request outcomes independently of search matches and selected values. */
export function SelectFetchFeedback({
  loading,
  result,
  onRetry,
  retryDisabled,
  allowCustomValue,
}: {
  loading: boolean
  result: SelectFetchResult | null
  onRetry?: () => void
  retryDisabled?: boolean
  allowCustomValue?: boolean
}) {
  const { t } = useTranslation(["ui", "common"])
  if (!loading && !result) return null
  const failed = !loading && result?.status === SELECT_FETCH_STATUSES.Error
  const needsRecovery =
    !loading &&
    (failed ||
      (result?.status === SELECT_FETCH_STATUSES.Success && result.count === 0))
  const message =
    result?.status === SELECT_FETCH_STATUSES.Error
      ? result.message?.trim()
      : undefined
  const showDiagnosticDetails = Boolean(
    message &&
      (message.length > MAX_INLINE_DIAGNOSTIC_LENGTH || message.includes("\n")),
  )
  return (
    <div className="border-border-subtle shrink-0 border-t px-3 py-1 text-xs leading-relaxed">
      <p
        role={failed ? "alert" : "status"}
        className={
          failed ? "text-destructive-text break-words" : "text-muted-foreground"
        }
      >
        {loading
          ? t("common:status.loading")
          : result?.status === SELECT_FETCH_STATUSES.Error
            ? message && !showDiagnosticDetails
              ? message
              : t("ui:searchableSelect.fetchFailed")
            : result?.count === 0
              ? t("ui:searchableSelect.fetchEmpty")
              : t("ui:searchableSelect.fetchSuccess", { count: result?.count })}
      </p>
      {failed && showDiagnosticDetails ? (
        <details className="text-muted-foreground mt-1">
          <summary className="cursor-pointer">
            {t("ui:searchableSelect.fetchDetails")}
          </summary>
          <p className="mt-1 max-h-32 overflow-auto break-words whitespace-pre-wrap">
            {message}
          </p>
        </details>
      ) : null}
      {needsRecovery && (onRetry || allowCustomValue) ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {allowCustomValue ? (
            <p className="text-muted-foreground text-xs">
              {t("ui:searchableSelect.manualInputHint")}
            </p>
          ) : null}
          {onRetry ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="min-h-6 gap-x-1 px-0 py-0 text-xs font-normal"
              disabled={retryDisabled}
              onClick={onRetry}
              leftIcon={<RefreshCw className="size-3" aria-hidden="true" />}
            >
              {t("common:actions.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
