import {
  CheckIcon,
  ClockIcon,
  DocumentDuplicateIcon
} from "@heroicons/react/24/outline"
import { NewAPI } from "@lobehub/icons"
import { MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { IconButton } from "~/components/ui"
import { useChannelDialog } from "~/features/ChannelManagement"
import type { ApiToken, DisplaySiteData } from "~/types"
import { OpenInCherryStudio } from "~/utils/cherryStudio"
import { formatKeyTime, formatQuota, formatUsedQuota } from "~/utils/formatters"
import { showResultToast } from "~/utils/toastHelpers"

interface TokenDetailsProps {
  token: ApiToken
  copiedKey: string | null
  onCopyKey: (key: string) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
}

export function TokenDetails({
  token,
  copiedKey,
  onCopyKey,
  account,
  onOpenCCSwitchDialog
}: TokenDetailsProps) {
  const { t } = useTranslation("ui")
  const { openWithAccount } = useChannelDialog()

  const handleCopy = (event: MouseEvent) => {
    event.stopPropagation()
    onCopyKey(token.key)
  }

  const handleUseInCherry = (event: MouseEvent) => {
    event.stopPropagation()
    OpenInCherryStudio(account, token)
  }

  const handleExportToCCSwitch = (event: MouseEvent) => {
    event.stopPropagation()
    onOpenCCSwitchDialog?.(token, account)
  }

  const handleImportToNewApi = async (event: MouseEvent) => {
    event.stopPropagation()
    await openWithAccount(account, token, (result) => {
      showResultToast(result)
    })
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50/30 px-3 pb-3 dark:border-dark-bg-tertiary dark:bg-dark-bg-primary">
      <div className="mb-3 flex items-center space-x-1 pt-3 text-xs text-gray-500 dark:text-dark-text-secondary">
        <ClockIcon className="h-3 w-3" />
        <span>
          {t("dialog.copyKey.expireTime", {
            time: formatKeyTime(token.expired_time)
          })}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded border border-gray-100 bg-white p-2 dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary">
          <div className="mb-0.5 text-xs text-gray-500 dark:text-dark-text-secondary">
            {t("dialog.copyKey.usedQuota")}
          </div>
          <div className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
            {formatUsedQuota(token)}
          </div>
        </div>
        <div className="rounded border border-gray-100 bg-white p-2 dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary">
          <div className="mb-0.5 text-xs text-gray-500 dark:text-dark-text-secondary">
            {t("dialog.copyKey.remainingQuota")}
          </div>
          <div
            className={`text-sm font-semibold ${
              token.unlimited_quota || token.remain_quota < 0
                ? "text-green-600"
                : token.remain_quota < 1000000
                  ? "text-orange-600"
                  : "text-gray-900 dark:text-dark-text-primary"
            }`}>
            {formatQuota(token)}
          </div>
        </div>
      </div>

      <div className="rounded border border-gray-100 bg-white p-2 dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-dark-text-secondary">
            {t("dialog.copyKey.apiKey")}
          </span>
          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
            <IconButton
              aria-label={
                copiedKey === token.key
                  ? t("dialog.copyKey.copied")
                  : t("dialog.copyKey.copy")
              }
              variant="ghost"
              size="sm"
              onClick={handleCopy}>
              {copiedKey === token.key ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <DocumentDuplicateIcon className="h-4 w-4 text-gray-500 dark:text-dark-text-tertiary" />
              )}
            </IconButton>
            <IconButton
              aria-label={t("dialog.copyKey.useInCherry")}
              variant="ghost"
              size="sm"
              onClick={handleUseInCherry}>
              <CherryIcon className="h-4 w-4 text-purple-500 dark:text-purple-400" />
            </IconButton>
            {onOpenCCSwitchDialog && (
              <IconButton
                aria-label={t("dialog.copyKey.exportToCCSwitch")}
                variant="ghost"
                size="sm"
                onClick={handleExportToCCSwitch}>
                <CCSwitchIcon />
              </IconButton>
            )}
            <IconButton
              aria-label={t("keyManagement:actions.importToNewApi")}
              variant="ghost"
              size="sm"
              onClick={handleImportToNewApi}>
              <NewAPI.Color className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <div className="break-all rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs text-gray-700 dark:border-dark-bg-tertiary dark:bg-dark-bg-primary dark:text-dark-text-secondary">
          <span className="text-gray-900 dark:text-dark-text-primary">
            {token.key.substring(0, 16)}
          </span>
          <span className="text-gray-400 dark:text-gray-600">
            {"•".repeat(6)}
          </span>
          <span className="text-gray-900 dark:text-dark-text-primary">
            {token.key.substring(token.key.length - 6)}
          </span>
        </div>
      </div>
    </div>
  )
}
