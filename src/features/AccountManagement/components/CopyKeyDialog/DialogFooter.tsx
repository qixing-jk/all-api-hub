import { KeyIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

interface DialogFooterProps {
  tokenCount: number
  onClose: () => void
}

/**
 * Footer section for copy key dialog, showing token count summary and close action.
 */
export function DialogFooter({ tokenCount, onClose }: DialogFooterProps) {
  const { t } = useTranslation(["ui", "common"])

  return (
    <div className="dark:bg-dark-bg-secondary flex items-center justify-between bg-gray-50/50">
      <div className="flex items-center space-x-2">
        {tokenCount > 0 && (
          <div className="dark:text-dark-text-secondary flex items-center space-x-1.5 text-xs text-gray-500">
            <KeyIcon className="h-3 w-3" />
            <span>
              {t("ui:dialog.copyKey.totalKeys", { count: tokenCount })}
            </span>
          </div>
        )}
      </div>
      <Button onClick={onClose} variant="secondary" size="sm">
        {t("common:actions.close")}
      </Button>
    </div>
  )
}
