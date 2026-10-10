import { CircleHelp } from "lucide-react"
import { useTranslation } from "react-i18next"

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
    <Alert variant="default" className="mb-density-4">
      <div>
        <p className="mb-density-2 text-xs">
          {t("accountDialog:messages.autoDetectTakingTooLong")}
        </p>
        <Button
          type="button"
          onClick={handleHelpClick}
          variant="secondary"
          size="sm"
          leftIcon={<CircleHelp className="h-3 w-3" />}
        >
          {t("accountDialog:actions.helpDocument")}
        </Button>
      </div>
    </Alert>
  )
}
