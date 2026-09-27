import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { IconButton, WorkflowTransitionButton } from "~/components/ui"
import {
  getTempWindowFallbackSettingsAnchor,
  getTempWindowFallbackSettingsTab,
  isTempWindowFallbackReminderCode,
} from "~/features/AccountManagement/utils/tempWindowFallbackReminder"
import { ProtectionBypassHistoryLink } from "~/features/ProtectionBypass/components/ProtectionBypassHistoryLink"
import toast from "~/lib/notify"
import {
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type DisplaySiteData,
} from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"
import {
  getHealthStatusDisplay,
  getStatusIndicatorColor,
} from "~/utils/healthStatus"
import {
  openProtectionBypassHistory,
  openSettingsTab,
} from "~/utils/navigation"

const logger = createLogger("AccountList.SiteInfo")

interface SiteInfoHealthIndicatorProps {
  site: DisplaySiteData
  isRefreshing: boolean
  isHealthRefreshing: boolean
  isRefreshLocked: boolean
  onRefresh: () => void
}

/** Displays health and its recovery links without owning the row's shared refresh state. */
export function SiteInfoHealthIndicator({
  site,
  isRefreshing,
  isHealthRefreshing,
  isRefreshLocked,
  onRefresh,
}: SiteInfoHealthIndicatorProps) {
  const { t } = useTranslation(["account", "messages", "common"])
  const isAccountDisabled = site.disabled === true
  const healthStatusDisplay = getHealthStatusDisplay(site.health?.status, t)
  const healthCode = site.health?.code
  const canOpenProtectionBypassHistory =
    site.health?.status === SiteHealthStatus.Warning &&
    Object.values(TEMP_WINDOW_HEALTH_STATUS_CODES).some(
      (code) => code === healthCode,
    )
  const canOpenHealthSettings =
    site.health?.status === SiteHealthStatus.Warning &&
    isTempWindowFallbackReminderCode(healthCode ?? null)
  const healthSettingsTab =
    canOpenHealthSettings && healthCode
      ? getTempWindowFallbackSettingsTab(healthCode)
      : null
  const healthSettingsAnchor =
    canOpenHealthSettings && healthCode
      ? getTempWindowFallbackSettingsAnchor(healthCode)
      : undefined

  const handleOpenHealthSettings = (e: React.MouseEvent) => {
    if (!healthSettingsTab) return
    e.preventDefault()
    e.stopPropagation()
    void openSettingsTab(healthSettingsTab, {
      anchor: healthSettingsAnchor,
      preserveHistory: true,
    }).catch((error) => {
      const errorMessage = getErrorMessage(
        error,
        t("messages:toast.error.operationFailedGeneric"),
      )
      logger.error("Failed to open health settings tab", {
        error,
        errorMessage,
        accountId: site.id,
        healthSettingsTab,
      })
      toast.error(errorMessage)
    })
  }

  return (
    <Tooltip
      content={
        <div className="space-y-density-1">
          <p>
            {t("list.site.status")}:{" "}
            <span>{healthStatusDisplay.text || t("list.site.unknown")}</span>
          </p>
          {site.health?.reason && (
            <p>
              {t("list.site.reason")}:{" "}
              {healthSettingsTab ? (
                <WorkflowTransitionButton
                  variant="link"
                  size="sm"
                  className="h-auto min-h-0 p-0 text-left"
                  onClick={handleOpenHealthSettings}
                >
                  {site.health.reason}
                </WorkflowTransitionButton>
              ) : (
                site.health.reason
              )}
            </p>
          )}
          <p>
            {t("list.site.lastSync")}:{" "}
            {formatLocaleDateTime(
              site.last_sync_time,
              t("list.site.notAvailable"),
            )}
          </p>
          {canOpenProtectionBypassHistory && (
            <ProtectionBypassHistoryLink
              className="text-xs"
              onOpen={openProtectionBypassHistory}
            />
          )}
        </div>
      }
      position="right"
    >
      <IconButton
        variant="ghost"
        size="none"
        className={`h-4 w-4 shrink-0 rounded-full transition-all duration-200 hover:bg-transparent ${
          isRefreshing
            ? "animate-pulse opacity-60"
            : isAccountDisabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer hover:scale-125"
        }`}
        onClick={onRefresh}
        loading={isHealthRefreshing}
        disabled={isAccountDisabled || isRefreshLocked}
        aria-label={t("list.site.refreshHealthStatus")}
      >
        <span
          className={`h-2 w-2 rounded-full ${getStatusIndicatorColor(
            site.health?.status,
          )}`}
          aria-hidden="true"
        />
      </IconButton>
    </Tooltip>
  )
}
