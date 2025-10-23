import { DialogTitle } from "@headlessui/react"
import { KeyIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import type { DisplaySiteData } from "~/types"

interface DialogHeaderProps {
  account: DisplaySiteData | null
}

export function DialogHeader({ account }: DialogHeaderProps) {
  const { t } = useTranslation("ui")

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600">
          <KeyIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            {t("dialog.copyKey.title")}
          </DialogTitle>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-dark-text-secondary">
            {account?.name}
          </p>
        </div>
      </div>
      {/* close button removed; Modal will provide it */}
    </div>
  )
}
