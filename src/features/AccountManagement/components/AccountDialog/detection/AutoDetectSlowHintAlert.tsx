import { Info } from "lucide-react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, Notice } from "~/components/ui"
import { NOTICE_ACTION_LAYOUTS } from "~/components/ui/Notice"
import { createTab } from "~/utils/browser/tabs"
import { getDocsAutoDetectUrl } from "~/utils/navigation/docsLinks"

export interface AutoDetectSlowHintAlertProps {
  helpDocUrl?: string
  onHelpClick?: () => void
}

/**
 * Non-blocking hint shown when auto-detect is taking longer than expected.
 * Provides a direct link to the troubleshooting documentation.
 */
export default function AutoDetectSlowHintAlert({
  helpDocUrl = getDocsAutoDetectUrl(),
  onHelpClick,
}: AutoDetectSlowHintAlertProps) {
  const { t } = useTranslation("accountDialog")

  const handleHelpClick = () => {
    if (onHelpClick) {
      onHelpClick()
      return
    }
    void createTab(helpDocUrl, true)
  }

  return (
    <Notice
      tone="info"
      size="sm"
      role="status"
      actionsLayout={NOTICE_ACTION_LAYOUTS.Inline}
      className="mb-density-1"
      icon={<Info className="size-4 text-info-indicator" />}
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleHelpClick}
          rightIcon={
            <WorkflowTransitionIcon
              aria-hidden="true"
              className="size-3.5 shrink-0"
            />
          }
          className="bg-popover/85 hover:bg-popover dark:bg-popover/50"
        >
          {t("accountDialog:actions.helpDocument")}
        </Button>
      }
    >
      <p className="text-xs leading-relaxed text-info-soft-foreground sm:text-sm">
        {t("accountDialog:messages.autoDetectTakingTooLong")}
      </p>
    </Notice>
  )
}
