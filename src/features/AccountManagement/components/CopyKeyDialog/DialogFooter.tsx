import { KeyRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"

interface DialogFooterProps {
  keyCount: number
  onClose: () => void
  onOpenKeyManagement?: () => void
}

/**
 * Footer section for copy key dialog, showing key count summary and close action.
 */
export function DialogFooter({
  keyCount,
  onClose,
  onOpenKeyManagement,
}: DialogFooterProps) {
  const { t } = useTranslation(["ui", "common", "account"])

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        {keyCount > 0 && (
          <div className="dark:text-dark-text-secondary flex items-center space-x-1.5 text-xs text-gray-500">
            <KeyRound className="h-3 w-3" />
            <span>{t("ui:dialog.copyKey.totalKeys", { count: keyCount })}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onOpenKeyManagement ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenKeyManagement}
            analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.OpenKeyManagement}
          >
            <KeyRound aria-hidden="true" className="h-4 w-4" />
            {t("account:actions.keyManagement")}
          </Button>
        ) : null}
        <Button onClick={onClose} variant="secondary" size="sm">
          {t("common:actions.close")}
        </Button>
      </div>
    </div>
  )
}
