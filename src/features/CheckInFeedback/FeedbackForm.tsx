import { Check, Globe, Info } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { FormField, Spinner, Switch, Textarea } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import ResultStatusBadge from "~/features/AutoCheckin/components/ResultStatusBadge"
import { getAutoCheckinResultMessage } from "~/features/AutoCheckin/utils/autoCheckin"
import { formatTimestamp } from "~/features/AutoCheckin/utils/tableUtils"
import type { AuthConfig } from "~/services/apiTransport/type"
import {
  buildCheckInFeedbackDetails,
  buildCheckInFeedbackIssue,
  composeCheckInFeedback,
  getFeedbackOrigin,
  type CheckInFeedbackSnapshot,
} from "~/services/checkin/feedback/report"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"
import pkg from "~~/package.json"

import { FeedbackFormFooter } from "./FeedbackFormFooter"
import { FeedbackReportEditor } from "./FeedbackReportEditor"
import { useFeedbackClues } from "./useFeedbackClues"
import { useFeedbackSubmission } from "./useFeedbackSubmission"

/** Keeps editable report sections and scan results in this dialog session only. */
export function FeedbackForm({
  snapshot,
  auth,
  onClose,
}: {
  snapshot: CheckInFeedbackSnapshot
  auth?: AuthConfig
  onClose: () => void
}) {
  const { t } = useTranslation(["accountDialog", "autoCheckin"])
  const id = useId()
  const executionMessage = (() => {
    if (!snapshot.execution) return ""
    let text = getAutoCheckinResultMessage(t, snapshot.execution)
    for (const secret of [
      auth?.accessToken,
      auth?.cookie,
      auth?.refreshToken,
    ]) {
      if (secret) text = text.replaceAll(secret, "[REDACTED]")
    }
    // Public reports do not carry URLs embedded in error messages.
    return sanitizeSensitiveErrorText(text)
      .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
      .slice(0, 2000)
  })()
  const [notes, setNotes] = useState("")
  const [includeAddress, setIncludeAddress] = useState(true)
  const [details, setDetails] = useState(() =>
    buildCheckInFeedbackDetails(
      { ...snapshot, authType: auth?.authType },
      {
        version: pkg.version,
        executionMessage,
        platform: import.meta.env.FIREFOX ? "firefox" : "chromium",
      },
    ),
  )
  const { clues, setClues, scanStatus, authUnavailable, scanning } =
    useFeedbackClues(snapshot, auth)
  const origin = getFeedbackOrigin(snapshot.baseUrl)
  const report = composeCheckInFeedback({
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
  })
  const issue = buildCheckInFeedbackIssue(
    report,
    t("checkInFeedback.issueTitle"),
  )
  const submission = useFeedbackSubmission(report, issue)
  const { opening, previewOpen, setPreviewOpen, rawOpen, setRawOpen } =
    submission
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("checkInFeedback.title")}
      header={
        <div className="space-y-density-1 pr-6">
          <h2 className="text-lg font-semibold">
            {t("checkInFeedback.title")}
          </h2>
          <p className="text-muted-foreground text-sm leading-6">
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
        className="space-y-density-5 [container-type:inline-size]"
        data-testid="checkin-feedback-form"
      >
        <div className="space-y-density-3">
          <div className="gap-y-density-3 flex flex-col items-start gap-x-3 [@container(min-width:28rem)]:flex-row [@container(min-width:28rem)]:items-center [@container(min-width:28rem)]:justify-between">
            <div className="min-w-0 flex-1">
              <div className="gap-y-density-2 flex items-center gap-x-2 text-sm font-medium">
                <Globe className="text-faint-foreground h-4 w-4 shrink-0" />
                <span className="break-all">
                  {origin ?? t("checkInFeedback.reportSite")}
                </span>
              </div>
            </div>
            <label
              className="text-muted-foreground gap-y-density-2 flex shrink-0 items-center gap-x-2 text-xs"
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
          {executionMessage && (
            <div className="bg-surface-subtle dark:bg-card/50 space-y-density-2 py-density-2-5 rounded-lg px-3">
              <div className="gap-y-density-2 flex flex-wrap items-center justify-between gap-x-2">
                <ResultStatusBadge status={snapshot.execution!.status} />
                <span className="text-muted-foreground text-xs">
                  {formatTimestamp(snapshot.execution?.timestamp)}
                </span>
              </div>
              <p className="text-sm leading-6 break-words">
                {executionMessage}
              </p>
            </div>
          )}
        </div>
        <FormField label={t("checkInFeedback.notes")} htmlFor={`${id}-notes`}>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("checkInFeedback.placeholder")}
            rows={4}
            className="min-h-32 resize-y leading-6"
          />
        </FormField>
        <div
          className="text-muted-foreground gap-y-density-2 flex items-start gap-x-2 text-xs"
          role="status"
        >
          {scanning ? (
            <Spinner size="sm" />
          ) : scanStatus === "completed" ? (
            <Check className="text-success-text mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="space-y-density-1 min-w-0 leading-5">
            <p>
              {scanning
                ? t("checkInFeedback.scanning")
                : scanStatus === "completed"
                  ? t("checkInFeedback.scanCompleted")
                  : scanStatus === "partial"
                    ? t("checkInFeedback.scanPartial")
                    : t("checkInFeedback.scanEmpty")}
            </p>
            {authUnavailable && <p>{t("checkInFeedback.authUnavailable")}</p>}
          </div>
        </div>
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
