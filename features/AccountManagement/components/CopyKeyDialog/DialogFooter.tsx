import { KeyIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

interface DialogFooterProps {
  tokenCount: number
  onClose: () => void
}

export function DialogFooter({ tokenCount, onClose }: DialogFooterProps) {
  const { t } = useTranslation(["ui", "common"])

  return (
    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {tokenCount > 0 && (
            <div className="flex items-center space-x-1.5 text-xs text-gray-500 dark:text-dark-text-secondary">
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
    </div>
  )
}
