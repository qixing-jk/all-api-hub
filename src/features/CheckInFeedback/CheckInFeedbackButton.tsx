import { MessageSquarePlus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

import { useCheckInFeedback } from "./useCheckInFeedback"

/** Provides a compact account-specific entry without requiring account-editor context. */
export function CheckInFeedbackButton({
  accountId,
  requestSupport = false,
}: {
  accountId: string
  requestSupport?: boolean
}) {
  const { t } = useTranslation("accountDialog")
  const { openFeedback, feedbackDialog } = useCheckInFeedback()
  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-auto min-h-0 justify-start px-0 py-1 text-xs text-gray-500 dark:text-gray-400"
        variant="ghost"
        onClick={() => openFeedback({ accountId })}
        leftIcon={<MessageSquarePlus className="h-4 w-4" />}
      >
        {requestSupport
          ? t("checkInFeedback.request")
          : t("checkInFeedback.feedback")}
      </Button>
      {feedbackDialog}
    </>
  )
}
