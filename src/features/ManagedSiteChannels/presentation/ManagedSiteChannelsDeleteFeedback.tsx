import { Badge } from "~/components/ui"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"

import type {
  ManagedChannelsCapabilities,
  ManagedChannelsDeleteState,
  ManagedChannelsLabels,
} from "./contracts"

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

      {deleteState.results.length > 0 ? (
        <section
          role="status"
          aria-label={labels.deleteResultsTitle}
          className="space-y-3 rounded-md border p-4"
        >
          <div>
            <h3 className="font-medium">{labels.deleteResultsTitle}</h3>
            {deleteState.requiresRefresh ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {labels.deleteRefreshRequired}
              </p>
            ) : null}
          </div>
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
                    result.status === "success"
                      ? "success"
                      : result.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {labels.deleteResultStatusLabels[result.status]}
                </Badge>
              </li>
            ))}
          </ol>
          {deleteState.requiresRefresh ? renderRefreshAction() : null}
        </section>
      ) : null}
    </>
  )
}
