import { CheckIcon, ClockIcon } from "@heroicons/react/24/outline"
import { Copy } from "lucide-react"
import { MouseEvent, useState } from "react"
import { useTranslation } from "react-i18next"

import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { ClaudeCodeRouterIcon } from "~/components/icons/ClaudeCodeRouterIcon"
import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import { KiloCodeIcon } from "~/components/icons/KiloCodeIcon"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { KiloCodeExportDialog } from "~/components/KiloCodeExportDialog"
import { IconButton } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { ApiToken, DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import {
  formatKeyTime,
  formatQuota,
  formatUsedQuota,
} from "~/utils/core/formatters"
import { showResultToast } from "~/utils/core/toastHelpers"

interface TokenDetailsProps {
  token: ApiToken
  copiedTokenId: number | null
  onCopyKey: (token: ApiToken) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
}

/**
 * Displays detailed token metadata, quota information, and export actions inside copy key dialog.
 */
export function TokenDetails({
  token,
  copiedTokenId,
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
  const [isKiloCodeDialogOpen, setIsKiloCodeDialogOpen] = useState(false)

  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)

  const handleCopy = (event: MouseEvent) => {
    event.stopPropagation()
    void onCopyKey(token)
  }

  const handleUseInCherry = async (event: MouseEvent) => {
    event.stopPropagation()
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToCherryStudio,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      const resolvedToken = await resolveDisplayAccountTokenForSecret(
        account,
        token,
      )
      OpenInCherryStudio(account, resolvedToken)
      await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error: getErrorMessage(error, t("messages:errors.unknown")),
        }),
      })
    }
  }

  const handleExportToCCSwitch = (event: MouseEvent) => {
    event.stopPropagation()
    onOpenCCSwitchDialog?.(token, account)
  }

  const handleImportToManagedSite = async (event: MouseEvent) => {
    event.stopPropagation()
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    const result = await openWithAccount(account, token, (result) => {
      showResultToast(result)
    })

    if (result.opened || result.deferred) {
      await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      return
    }

    await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
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
      <KiloCodeExportDialog
        isOpen={isKiloCodeDialogOpen}
        onClose={() => setIsKiloCodeDialogOpen(false)}
        initialSelectedSiteIds={[account.id]}
        initialSelectedTokenIdsBySite={{ [account.id]: [`${token.id}`] }}
      />
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
                copiedTokenId === token.id
                  ? t("dialog.copyKey.copied")
                  : t("dialog.copyKey.copy")
              }
              variant="ghost"
              size="sm"
              onClick={handleCopy}
            >
              {copiedTokenId === token.id ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
              )}
            </IconButton>
            <IconButton
              aria-label={t("dialog.copyKey.useInCherry")}
              variant="ghost"
              size="sm"
              onClick={handleUseInCherry}
            >
              <CherryIcon />
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
              aria-label={t("keyManagement:actions.exportToKiloCode")}
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                setIsKiloCodeDialogOpen(true)
              }}
            >
              <KiloCodeIcon className="dark:text-dark-text-tertiary text-gray-500" />
            </IconButton>
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
