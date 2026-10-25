import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
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
      <HelpHintIcon className="h-4 w-4" aria-hidden="true" />
    </IconButton>
  )
}
