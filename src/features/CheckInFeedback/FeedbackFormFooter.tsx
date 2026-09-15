import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, Notice } from "~/components/ui"

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
  const failed = feedback === "copyFailed" || feedback === "openFailed"
  return (
    <div className="space-y-3">
      {feedback && (
        <Notice
          tone={failed ? "destructive" : "success"}
          role={failed ? "alert" : "status"}
          description={
            feedback === "copied"
              ? t("checkInFeedback.copied")
              : feedback === "copyFailed"
                ? t("checkInFeedback.copyFailed")
                : feedback === "openFailed"
                  ? t("checkInFeedback.openFailed")
                  : feedback === "paste"
                    ? t("checkInFeedback.paste")
                    : t("checkInFeedback.opened")
          }
        />
      )}
      <p className="text-muted-foreground text-xs leading-5">
        {t("checkInFeedback.disclosure")}
      </p>
      {needsCopy && (
        <p className="text-muted-foreground text-xs">
          {t("checkInFeedback.longReport")}
        </p>
      )}
      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="mr-auto"
          onClick={onClose}
        >
          {t("common:actions.close")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void copy()}
          leftIcon={<Copy className="h-4 w-4" />}
        >
          {t("checkInFeedback.copy")}
        </Button>
        <Button
          type="button"
          onClick={() => void open(manualCopy)}
          className="col-span-2 h-auto min-h-(--density-control) whitespace-normal"
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
