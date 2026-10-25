import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import { Alert, Button } from "~/components/ui"
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
    <Alert variant="default" className="mb-density-4 sm:items-center">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <p className="min-w-0 text-xs leading-5 sm:flex-1">
          {t("accountDialog:messages.autoDetectTakingTooLong")}
        </p>
        <Button
          type="button"
          onClick={handleHelpClick}
          variant="secondary"
          size="sm"
          className="shrink-0 self-start sm:self-center"
          leftIcon={<HelpHintIcon className="h-3 w-3" />}
        >
          {t("accountDialog:actions.helpDocument")}
        </Button>
      </div>
    </Alert>
  )
}
