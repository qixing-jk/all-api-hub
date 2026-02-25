import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Alert, Button } from "~/components/ui"
import { getDocsAutoDetectUrl } from "~/utils/docsLinks"

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
    browser.tabs.create({ url: helpDocUrl, active: true })
  }

  return (
    <Alert variant="info" className="mb-4">
      <div>
        <p className="mb-2 text-xs">{t("messages.autoDetectTakingTooLong")}</p>
        <Button
          type="button"
          onClick={handleHelpClick}
          variant="secondary"
          size="sm"
          leftIcon={<QuestionMarkCircleIcon className="h-3 w-3" />}
        >
          {t("actions.helpDocument")}
        </Button>
      </div>
    </Alert>
  )
}
