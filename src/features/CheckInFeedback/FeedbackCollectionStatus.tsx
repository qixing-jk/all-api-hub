import { useTranslation } from "react-i18next"

import { InlineMessage, NoticeActionButton, Spinner } from "~/components/ui"
import { FEEDBACK_SCAN_STATUSES } from "~/services/checkin/discovery/evidence/scanTypes"
import {
  FEEDBACK_EXECUTION_RECORDS,
  type FeedbackExecutionRecord,
} from "~/services/checkin/feedback/executionTypes"

import type { FeedbackCollectionStatus } from "./useFeedbackClues"

/** Presents collection progress and the recovery action for unreadable execution evidence. */
export function FeedbackCollectionStatus({
  id,
  scanStatus,
  scanning,
  authUnavailable,
  recordState,
  reloading,
  reloadExecution,
}: {
  id: string
  scanStatus: FeedbackCollectionStatus
  scanning: boolean
  authUnavailable: boolean
  recordState: FeedbackExecutionRecord
  reloading: boolean
  reloadExecution?: () => Promise<void>
}) {
  const { t } = useTranslation("accountDialog")
  const recordNotice =
    recordState === FEEDBACK_EXECUTION_RECORDS.ReadFailed
      ? t("checkInFeedback.executionReadFailed")
      : recordState === FEEDBACK_EXECUTION_RECORDS.Invalid
        ? t("checkInFeedback.executionInvalid")
        : ""
  return (
    <div className="space-y-density-3 border-t border-border pt-density-3">
      <InlineMessage
        size="sm"
        className="leading-5"
        tone={
          !scanning && scanStatus === FEEDBACK_SCAN_STATUSES.Completed
            ? "success"
            : "neutral"
        }
        icon={scanning ? <Spinner size="sm" aria-hidden="true" /> : undefined}
      >
        <div className="min-w-0 space-y-density-1 leading-5">
          <p>
            {scanning
              ? t("checkInFeedback.scanning")
              : scanStatus === FEEDBACK_SCAN_STATUSES.Completed
                ? t("checkInFeedback.scanCompleted")
                : scanStatus === FEEDBACK_SCAN_STATUSES.Partial
                  ? t("checkInFeedback.scanPartial")
                  : t("checkInFeedback.scanEmpty")}
          </p>
          {authUnavailable && <p>{t("checkInFeedback.authUnavailable")}</p>}
        </div>
      </InlineMessage>
      {recordNotice && (
        <InlineMessage
          tone="warning"
          size="sm"
          className="leading-5"
          aria-labelledby={`${id}-record-notice`}
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-density-1 leading-5">
            <p id={`${id}-record-notice`}>{recordNotice}</p>
            {reloadExecution && (
              <NoticeActionButton
                type="button"
                className="leading-5 disabled:cursor-not-allowed disabled:opacity-50"
                aria-describedby={`${id}-record-notice`}
                aria-busy={reloading}
                disabled={reloading}
                onClick={() => void reloadExecution()}
              >
                {reloading && (
                  <Spinner
                    size="sm"
                    aria-hidden="true"
                    className="mr-1 inline-block align-middle"
                  />
                )}
                {t("checkInFeedback.retryExecution")}
              </NoticeActionButton>
            )}
          </div>
        </InlineMessage>
      )}
    </div>
  )
}
