import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"

import type {
  ManagedChannelsCapabilities,
  ManagedChannelsDeleteState,
  ManagedChannelsLabels,
} from "./contracts"
import { MANAGED_CHANNELS_DELETE_RESULT_STATUSES } from "./contracts"

type ManagedSiteChannelsDeleteFeedbackProps = {
  deleteState: ManagedChannelsDeleteState
  labels: ManagedChannelsLabels
  canRefresh: ManagedChannelsCapabilities["canRefresh"]
  isRefreshing: boolean
  onRefresh: () => void
}

/** Renders settled delete feedback without owning replay or refresh state. */
export function ManagedSiteChannelsDeleteFeedback({
  deleteState,
  labels,
  canRefresh,
  isRefreshing,
  onRefresh,
}: ManagedSiteChannelsDeleteFeedbackProps) {
  const { t } = useTranslation("common")
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (deleteState.isWorking || deleteState.results.length === 0)
      setDismissed(false)
  }, [deleteState.isWorking, deleteState.results.length])
  const showResults =
    !dismissed &&
    !deleteState.isWorking &&
    deleteState.results.some(
      ({ status }) =>
        status !== MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Success,
    )
  const showRefreshNotice =
    deleteState.results.length > 0 &&
    !deleteState.isWorking &&
    deleteState.requiresRefresh &&
    !deleteState.failure &&
    !showResults

  const renderRefreshAction = () => (
    <Button
      type="button"
      variant="outline"
      onClick={onRefresh}
      disabled={isRefreshing || !canRefresh}
    >
      {labels.deleteRefreshAction}
    </Button>
  )

  return (
    <>
      {deleteState.failure ? (
        <Alert
          role="alert"
          variant={deleteState.failure.variant ?? "destructive"}
        >
          <AlertTitle>{deleteState.failure.category}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="whitespace-pre-line">{deleteState.failure.message}</p>
            {deleteState.requiresRefresh ? renderRefreshAction() : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {showRefreshNotice ? (
        <Alert>
          <AlertDescription className="space-y-3">
            <p>{labels.deleteRefreshRequired}</p>
            {renderRefreshAction()}
          </AlertDescription>
        </Alert>
      ) : null}

      {showResults ? (
        <section
          role="status"
          aria-label={labels.deleteResultsTitle}
          className="space-y-3 rounded-md border p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">{labels.deleteResultsTitle}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
            >
              {t("common:actions.close")}
            </Button>
          </div>
          {deleteState.requiresRefresh ? (
            <p className="text-muted-foreground text-sm">
              {labels.deleteRefreshRequired}
            </p>
          ) : null}
          <ol className="space-y-2">
            {deleteState.results.map((result) => (
              <li
                key={result.rowKey}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate text-sm">
                  {result.displayLabel}
                </span>
                <Badge
                  variant={
                    result.status ===
                    MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Success
                      ? "success"
                      : result.status ===
                          MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Failed
                        ? "danger"
                        : "warning"
                  }
                >
                  {labels.deleteResultStatusLabels[result.status]}
                </Badge>
              </li>
            ))}
          </ol>
          {deleteState.requiresRefresh && !deleteState.failure
            ? renderRefreshAction()
            : null}
        </section>
      ) : null}
    </>
  )
}
