import { Settings } from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"
import { openSettingsTab } from "~/utils/navigation"

interface OptionsPageSettingsTitleActionProps {
  tabId: string
  anchor?: string
  label?: string
  analyticsAction?: ProductAnalyticsScopedActionConfig
}

/**
 * Compact title-adjacent shortcut for options pages with related Basic Settings.
 */
export function OptionsPageSettingsTitleAction({
  tabId,
  anchor,
  label,
  analyticsAction,
}: OptionsPageSettingsTitleActionProps) {
  const { t } = useTranslation("common")
  const resolvedLabel = label ?? t("labels.settings")

  return (
    <Tooltip content={resolvedLabel}>
      <IconButton
        type="button"
        size="sm"
        variant="outline"
        aria-label={resolvedLabel}
        analyticsAction={analyticsAction}
        onClick={() => {
          void openSettingsTab(tabId, {
            anchor,
            preserveHistory: true,
          })
        }}
      >
        <Settings className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  )
}
