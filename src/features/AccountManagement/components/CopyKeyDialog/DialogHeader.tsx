import { DialogTitle } from "@headlessui/react"
import { KeyIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import type { DisplaySiteData } from "~/types"

interface DialogHeaderProps {
  account: DisplaySiteData | null
}

/**
 * Header section for copy key dialog, rendering account name and iconography.
 */
export function DialogHeader({ account }: DialogHeaderProps) {
  const { t } = useTranslation("ui")

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <KeyIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <div>
          <DialogTitle className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
            {t("dialog.copyKey.title")}
          </DialogTitle>
          <p className="dark:text-dark-text-secondary mt-0.5 text-xs text-gray-500">
            {account?.name}
          </p>
        </div>
      </div>
      {/* close button removed; Modal will provide it */}
    </div>
  )
}
