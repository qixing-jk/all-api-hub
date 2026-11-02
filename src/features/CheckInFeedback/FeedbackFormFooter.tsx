import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, Notice } from "~/components/ui"
import { cn } from "~/lib/utils"

import { SUBMISSION_FEEDBACK } from "./submissionFeedback"
import type { useFeedbackSubmission } from "./useFeedbackSubmission"

/** Presents report-sharing actions and their recovery feedback. */
export function FeedbackFormFooter({
  submission,
  needsCopy,
  onClose,
}: {
  submission: ReturnType<typeof useFeedbackSubmission>
  needsCopy: boolean
  onClose: () => void
}) {
  const { t } = useTranslation("accountDialog")
  const { feedback, opening, manualCopy, copy, open } = submission
  const copyBeforeOpening = needsCopy && !manualCopy
  const failed =
    feedback === SUBMISSION_FEEDBACK.COPY_FAILED ||
    feedback === SUBMISSION_FEEDBACK.OPEN_FAILED
  const feedbackMessages = {
    [SUBMISSION_FEEDBACK.COPIED]: t("checkInFeedback.copied"),
    [SUBMISSION_FEEDBACK.COPY_FAILED]: t("checkInFeedback.copyFailed"),
    [SUBMISSION_FEEDBACK.OPEN_FAILED]: t("checkInFeedback.openFailed"),
    [SUBMISSION_FEEDBACK.OPENED]: t("checkInFeedback.opened"),
    [SUBMISSION_FEEDBACK.PASTE]: t("checkInFeedback.paste"),
  }
  return (
    <div className="space-y-density-3">
      {feedback && (
        <Notice
          tone={failed ? "destructive" : "success"}
          role={failed ? "alert" : "status"}
          description={feedbackMessages[feedback]}
        />
      )}
      <p className="text-muted-foreground text-xs leading-5">
        {t("checkInFeedback.disclosure")}
      </p>
      {needsCopy && (
        <Notice
          tone="warning"
          size="sm"
          description={t("checkInFeedback.longReport")}
        />
      )}
      <div className="gap-y-density-2 grid grid-cols-2 items-center gap-x-2 sm:flex sm:flex-wrap sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="mr-auto"
          onClick={onClose}
        >
          {t("common:actions.close")}
        </Button>
        {!copyBeforeOpening && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void copy()}
            leftIcon={<Copy className="h-4 w-4" />}
          >
            {t("checkInFeedback.copy")}
          </Button>
        )}
        <Button
          type="button"
          onClick={() => void open(manualCopy)}
          className={cn(
            "h-auto min-h-(--density-control) whitespace-normal",
            !copyBeforeOpening && "col-span-2",
          )}
          loading={opening}
          leftIcon={<WorkflowTransitionIcon className="h-4 w-4" />}
        >
          {manualCopy
            ? t("checkInFeedback.manualCopied")
            : needsCopy
              ? t("checkInFeedback.copyAndOpen")
              : t("checkInFeedback.open")}
        </Button>
      </div>
    </div>
  )
}
