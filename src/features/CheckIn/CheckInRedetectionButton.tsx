import { CalendarCheck2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

import { useCheckInRedetection } from "./useCheckInRedetection"

/** Opens the same foreground workflow from readiness rows and other account surfaces. */
export function CheckInRedetectionButton({
  accountId,
  onUpdated,
}: {
  accountId: string
  onUpdated?: () => void | Promise<unknown>
}) {
  const { t } = useTranslation("accountDialog")
  const { redetect, isPending, selectionDialog } = useCheckInRedetection(
    accountId,
    onUpdated,
  )
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        loading={isPending}
        disabled={isPending}
        onClick={() => void redetect()}
        leftIcon={<CalendarCheck2 className="h-4 w-4" />}
      >
        {isPending
          ? t("form.redetectingCheckInMethods")
          : t("form.redetectCheckInMethods")}
      </Button>
      {selectionDialog}
    </>
  )
}
