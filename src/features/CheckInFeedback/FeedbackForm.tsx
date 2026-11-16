import { Globe } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { FormField, Switch, Textarea } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import ResultStatusBadge from "~/features/AutoCheckin/results/ResultStatusBadge"
import { formatTimestamp } from "~/features/AutoCheckin/table/tableUtils"
import type { AuthConfig } from "~/services/apiTransport/type"
import type { FeedbackExecutionEvidence } from "~/services/checkin/feedback/execution"
import { FEEDBACK_EXECUTION_SOURCES } from "~/services/checkin/feedback/executionTypes"
import {
  buildCheckInFeedbackIssue,
  composeCheckInFeedback,
  getFeedbackOrigin,
  type CheckInFeedbackSnapshot,
} from "~/services/checkin/feedback/report"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import pkg from "~~/package.json"

import { FeedbackCollectionStatus } from "./FeedbackCollectionStatus"
import { FeedbackFormFooter } from "./FeedbackFormFooter"
import { FeedbackReportEditor } from "./FeedbackReportEditor"
import { useFeedbackClues } from "./useFeedbackClues"
import { useFeedbackDetails } from "./useFeedbackDetails"
import { useFeedbackSubmission } from "./useFeedbackSubmission"

/** Keeps editable report sections and scan results in this dialog session only. */
export function FeedbackForm({
  snapshot: initialSnapshot,
  auth,
  reloadExecution,
  isOpen = true,
  onClose,
  onCloseComplete,
}: {
  snapshot: CheckInFeedbackSnapshot
  auth?: AuthConfig
  reloadExecution?: () => Promise<FeedbackExecutionEvidence>
  isOpen?: boolean
  onClose: () => void
  onCloseComplete?: () => void
}) {
  const { t } = useTranslation(["accountDialog", "autoCheckin"])
  const id = useId()
  const [notes, setNotes] = useState("")
  const [includeAddress, setIncludeAddress] = useState(true)
  const {
    snapshot,
    browserInfo,
    details,
    setDetails,
    executionMessage,
    recordState,
    reloading,
    handleReloadExecution,
  } = useFeedbackDetails(initialSnapshot, auth, reloadExecution)
  const { clues, setClues, scanStatus, authUnavailable, scanning } =
    useFeedbackClues(initialSnapshot, auth)
  const execution = snapshot.execution
  const origin = getFeedbackOrigin(snapshot.baseUrl)
  const reportInput = {
    origin: includeAddress ? origin : null,
    notes,
    details,
    clues,
    labels: {
      site: t("checkInFeedback.reportSite"),
      problem: t("checkInFeedback.reportProblem"),
      details: t("checkInFeedback.details"),
      clues: t("checkInFeedback.clues"),
    },
  }
  const report = composeCheckInFeedback(reportInput)
  const issue = buildCheckInFeedbackIssue(
    report,
    t("checkInFeedback.issueTitle"),
    {
      origin: includeAddress ? origin : null,
      version: pkg.version,
      notes,
      browserInfo,
      feedbackBody: composeCheckInFeedback({
        ...reportInput,
        origin: null,
        notes: "",
      }),
    },
  )
  const submission = useFeedbackSubmission(report, issue)
  const { opening, previewOpen, setPreviewOpen, rawOpen, setRawOpen } =
    submission
  return (
    <Modal
      isOpen={isOpen}
      onCloseComplete={onCloseComplete}
      onClose={onClose}
      title={t("checkInFeedback.title")}
      header={
        <div className="space-y-density-1 pr-6">
          <h2 className="text-lg font-semibold">
            {t("checkInFeedback.title")}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("checkInFeedback.intro")}
          </p>
        </div>
      }
      size="lg"
      panelClassName="sm:max-w-xl"
      closeOnBackdropClick={false}
      focusFallbackKey={`${opening}:${scanStatus}`}
      footer={
        <FeedbackFormFooter
          submission={submission}
          needsCopy={issue.needsCopy}
          onClose={onClose}
        />
      }
    >
      <div
        className="[container-type:inline-size] space-y-density-5"
        data-testid="checkin-feedback-form"
      >
        <div className="space-y-density-3">
          <div className="flex flex-col items-start gap-x-3 gap-y-density-3 [@container(min-width:28rem)]:flex-row [@container(min-width:28rem)]:items-center [@container(min-width:28rem)]:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-x-2 gap-y-density-2 text-sm font-medium">
                <Globe className="h-4 w-4 shrink-0 text-faint-foreground" />
                <span className="break-all">
                  {origin ?? t("checkInFeedback.reportSite")}
                </span>
              </div>
            </div>
            <label
              className="flex shrink-0 items-center gap-x-2 gap-y-density-2 text-xs text-muted-foreground"
              htmlFor={`${id}-address`}
            >
              {t("checkInFeedback.includeAddress")}
              <Switch
                id={`${id}-address`}
                checked={includeAddress}
                onChange={setIncludeAddress}
                disabled={!origin}
                aria-describedby={`${id}-address-hint`}
              />
            </label>
          </div>
          <p id={`${id}-address-hint`} className="sr-only">
            {t("checkInFeedback.addressHint")}
          </p>
          {executionMessage && execution && (
            <div className="space-y-density-2 rounded-lg bg-surface-subtle px-3 py-density-2-5 dark:bg-card/50">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-density-2">
                <ResultStatusBadge
                  status={execution.status}
                  label={
                    snapshot.executionSource ===
                      FEEDBACK_EXECUTION_SOURCES.SavedHistory &&
                    execution.status === CHECKIN_RESULT_STATUS.SUCCESS
                      ? t("autoCheckin:providerFallback.checkinSuccessful")
                      : undefined
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(execution.timestamp)}
                </span>
              </div>
              <p className="text-sm leading-6 break-words">
                {executionMessage}
              </p>
            </div>
          )}
        </div>
        <FormField
          label={t("checkInFeedback.notes")}
          htmlFor={`${id}-notes`}
          description={t("checkInFeedback.notesHint")}
        >
          {(control) => (
            <Textarea
              {...control}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("checkInFeedback.placeholder")}
              rows={4}
              className="min-h-32 resize-y leading-6"
            />
          )}
        </FormField>
        <FeedbackCollectionStatus
          id={id}
          scanStatus={scanStatus}
          scanning={scanning}
          authUnavailable={authUnavailable}
          recordState={recordState}
          reloading={reloading}
          reloadExecution={reloadExecution ? handleReloadExecution : undefined}
        />
        <FeedbackReportEditor
          id={id}
          report={report}
          details={details}
          setDetails={setDetails}
          clues={clues}
          setClues={setClues}
          scanning={scanning}
          previewOpen={previewOpen}
          setPreviewOpen={setPreviewOpen}
          rawOpen={rawOpen}
          setRawOpen={setRawOpen}
        />
      </div>
    </Modal>
  )
}
