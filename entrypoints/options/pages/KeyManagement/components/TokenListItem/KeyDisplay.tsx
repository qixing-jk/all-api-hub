import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"

import { formatKey } from "../../utils"

interface KeyDisplayProps {
  tokenKey: string
  tokenId: number
  visibleKeys: Set<number>
  toggleKeyVisibility: (id: number) => void
}

export function KeyDisplay({
  tokenKey,
  tokenId,
  visibleKeys,
  toggleKeyVisibility
}: KeyDisplayProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
        {t("keyDetails.key")}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <code className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary inline-block max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 align-middle font-mono text-[10px] text-gray-800 sm:px-2 sm:py-1 sm:text-xs">
          {formatKey(tokenKey, tokenId, visibleKeys)}
        </code>
        <IconButton
          variant="ghost"
          size="sm"
          onClick={() => toggleKeyVisibility(tokenId)}
          aria-label={
            visibleKeys.has(tokenId)
              ? t("actions.hideKey")
              : t("actions.showKey")
          }
          className="shrink-0">
          {visibleKeys.has(tokenId) ? (
            <EyeSlashIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          ) : (
            <EyeIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          )}
        </IconButton>
      </div>
    </div>
  )
}
