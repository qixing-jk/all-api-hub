import { KeyRound } from "lucide-react"
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
        <KeyRound className="text-theme-600 dark:text-theme-400 h-5 w-5" />
        <div>
          <h2 className="text-foreground text-lg font-semibold">
            {t("dialog.copyKey.title")}
          </h2>
          <p className="dark:text-secondary-foreground text-muted-foreground mt-0.5 text-xs">
            {account?.name}
          </p>
        </div>
      </div>
      {/* close button removed; Modal will provide it */}
    </div>
  )
}
