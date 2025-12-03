import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline"
import React from "react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"

interface ModelItemExpandButtonProps {
  isExpanded: boolean
  onToggleExpand: () => void
}

export const ModelItemExpandButton: React.FC<ModelItemExpandButtonProps> = ({
  isExpanded,
  onToggleExpand,
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
      className="ml-4"
    >
      {isExpanded ? (
        <ChevronUpIcon className="h-4 w-4" />
      ) : (
        <ChevronDownIcon className="h-4 w-4" />
      )}
    </IconButton>
  )
}
