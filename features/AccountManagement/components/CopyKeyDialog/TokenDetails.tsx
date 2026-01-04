import {
  CheckIcon,
  ClockIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline"
import { MouseEvent, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/ChannelDialog"
import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { ClaudeCodeRouterIcon } from "~/components/icons/ClaudeCodeRouterIcon"
import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { IconButton } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type { ApiToken, DisplaySiteData } from "~/types"
import { OpenInCherryStudio } from "~/utils/cherryStudio"
import { formatKeyTime, formatQuota, formatUsedQuota } from "~/utils/formatters"
import { getManagedSiteLabelKey } from "~/utils/managedSite"
import { showResultToast } from "~/utils/toastHelpers"

interface TokenDetailsProps {
  token: ApiToken
  copiedKey: string | null
  onCopyKey: (key: string) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
}

/**
 * Displays detailed token metadata, quota information, and export actions inside copy key dialog.
 */
export function TokenDetails({
  token,
  copiedKey,
  onCopyKey,
  account,
  onOpenCCSwitchDialog,
}: TokenDetailsProps) {
  const { t } = useTranslation(["ui", "keyManagement", "settings"])
  const {
    managedSiteType,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    cliProxyBaseUrl,
    cliProxyManagementKey,
  } = useUserPreferencesContext()
  const { openWithAccount } = useChannelDialog()

  const [isClaudeCodeRouterOpen, setIsClaudeCodeRouterOpen] = useState(false)
  const [isCliProxyDialogOpen, setIsCliProxyDialogOpen] = useState(false)

  const managedSiteLabel = t(getManagedSiteLabelKey(managedSiteType))

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

  const handleImportToManagedSite = async (event: MouseEvent) => {
    event.stopPropagation()
    await openWithAccount(account, token, (result) => {
      showResultToast(result)
    })
  }

  const handleOpenCliProxyDialog = (event: MouseEvent) => {
    event.stopPropagation()
    if (!cliProxyBaseUrl?.trim() || !cliProxyManagementKey?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:cliproxy.configMissing"),
      })
      return
    }
    setIsCliProxyDialogOpen(true)
  }

  const handleOpenClaudeCodeRouter = (event: MouseEvent) => {
    event.stopPropagation()
    if (!claudeCodeRouterBaseUrl) {
      showResultToast({
        success: false,
        message: t("messages:claudeCodeRouter.configMissing"),
      })
      return
    }
    setIsClaudeCodeRouterOpen(true)
  }

  return (
    <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary border-t border-gray-100 bg-gray-50/30 px-3 pb-3">
      <ClaudeCodeRouterImportDialog
        isOpen={isClaudeCodeRouterOpen}
        onClose={() => setIsClaudeCodeRouterOpen(false)}
        account={account}
        token={token}
        routerBaseUrl={claudeCodeRouterBaseUrl}
        routerApiKey={claudeCodeRouterApiKey}
      />
      <CliProxyExportDialog
        isOpen={isCliProxyDialogOpen}
        onClose={() => setIsCliProxyDialogOpen(false)}
        account={account}
        token={token}
      />
      <div className="dark:text-dark-text-secondary mb-3 flex items-center space-x-1 pt-3 text-xs text-gray-500">
        <ClockIcon className="h-3 w-3" />
        <span>
          {t("dialog.copyKey.expireTime", {
            time: formatKeyTime(token.expired_time),
          })}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary rounded border border-gray-100 bg-white p-2">
          <div className="dark:text-dark-text-secondary mb-0.5 text-xs text-gray-500">
            {t("dialog.copyKey.usedQuota")}
          </div>
          <div className="dark:text-dark-text-primary text-sm font-semibold text-gray-900">
            {formatUsedQuota(token)}
          </div>
        </div>
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary rounded border border-gray-100 bg-white p-2">
          <div className="dark:text-dark-text-secondary mb-0.5 text-xs text-gray-500">
            {t("dialog.copyKey.remainingQuota")}
          </div>
          <div
            className={`text-sm font-semibold ${
              token.unlimited_quota || token.remain_quota < 0
                ? "text-green-600"
                : token.remain_quota < 1000000
                  ? "text-orange-600"
                  : "dark:text-dark-text-primary text-gray-900"
            }`}
          >
            {formatQuota(token)}
          </div>
        </div>
      </div>

      <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary rounded border border-gray-100 bg-white p-2">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="dark:text-dark-text-secondary text-xs font-medium tracking-wide text-gray-500 uppercase">
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
              onClick={handleCopy}
            >
              {copiedKey === token.key ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <DocumentDuplicateIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
              )}
            </IconButton>
            <IconButton
              aria-label={t("dialog.copyKey.useInCherry")}
              variant="ghost"
              size="sm"
              onClick={handleUseInCherry}
            >
              <CherryIcon className="h-4 w-4 text-purple-500 dark:text-purple-400" />
            </IconButton>
            {onOpenCCSwitchDialog && (
              <IconButton
                aria-label={t("dialog.copyKey.exportToCCSwitch")}
                variant="ghost"
                size="sm"
                onClick={handleExportToCCSwitch}
              >
                <CCSwitchIcon />
              </IconButton>
            )}
            <IconButton
              aria-label={t("keyManagement:actions.importToCliProxy")}
              variant="ghost"
              size="sm"
              onClick={handleOpenCliProxyDialog}
            >
              <CliProxyIcon size="sm" />
            </IconButton>
            <IconButton
              aria-label={t("keyManagement:actions.importToClaudeCodeRouter")}
              variant="ghost"
              size="sm"
              onClick={handleOpenClaudeCodeRouter}
            >
              <ClaudeCodeRouterIcon size="sm" />
            </IconButton>
            <IconButton
              aria-label={t("keyManagement:actions.importToManagedSite", {
                site: managedSiteLabel,
              })}
              variant="ghost"
              size="sm"
              onClick={handleImportToManagedSite}
            >
              <ManagedSiteIcon siteType={managedSiteType} size="sm" />
            </IconButton>
          </div>
        </div>
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary dark:text-dark-text-secondary rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs break-all text-gray-700">
          <span className="dark:text-dark-text-primary text-gray-900">
            {token.key.substring(0, 16)}
          </span>
          <span className="text-gray-400 dark:text-gray-600">
            {"•".repeat(6)}
          </span>
          <span className="dark:text-dark-text-primary text-gray-900">
            {token.key.substring(token.key.length - 6)}
          </span>
        </div>
      </div>
    </div>
  )
}
