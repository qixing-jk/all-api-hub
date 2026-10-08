import { CircleHelp } from "lucide-react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"

/** Shared, compact risk disclosure beside check-in controls. */
export function AutoCheckinRiskHint() {
  const { t } = useTranslation("autoCheckin")

  return (
    <IconButton
      type="button"
      variant="ghost"
      size="xs"
      aria-label={t("riskNotice.label")}
      tooltip={t("riskNotice.description")}
      className="text-faint-foreground shrink-0"
    >
      <CircleHelp className="h-4 w-4" aria-hidden="true" />
    </IconButton>
  )
}
