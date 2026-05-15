import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline"
import React from "react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"

interface ModelItemExpandButtonProps {
  isExpanded: boolean
  onToggleExpand: () => void
  analyticsAction?: ProductAnalyticsScopedActionConfig
}

export const ModelItemExpandButton: React.FC<ModelItemExpandButtonProps> = ({
  isExpanded,
  onToggleExpand,
  analyticsAction,
}) => {
  const { t } = useTranslation("modelList")
  return (
    <IconButton
      variant="ghost"
      size="sm"
      onClick={onToggleExpand}
      title={isExpanded ? t("collapseDetails") : t("expandDetails")}
      aria-label={isExpanded ? t("collapseDetails") : t("expandDetails")}
      aria-expanded={isExpanded}
      analyticsAction={analyticsAction}
    >
      {isExpanded ? (
        <ChevronUpIcon className="h-4 w-4" />
      ) : (
        <ChevronDownIcon className="h-4 w-4" />
      )}
    </IconButton>
  )
}
