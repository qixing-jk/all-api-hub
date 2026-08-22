import {
  CalendarDays,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  Gift,
  Link,
  Pin,
  RefreshCw,
  SquarePen,
  Tag,
  TriangleAlert,
  User,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { LdohIcon } from "~/components/icons/LdohIcon"
import Tooltip from "~/components/Tooltip"
import {
  Badge,
  BodySmall,
  Button,
  Caption,
  IconButton,
  WorkflowTransitionButton,
} from "~/components/ui"
import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import { isSelectedCheckInStatusCurrent } from "~/features/AccountManagement/components/AccountList/checkInFilter"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import type {
  HighlightFragment,
  SearchResultWithHighlight,
} from "~/features/AccountManagement/hooks/useAccountSearch"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  getHealthStatusDisplay,
  getStatusIndicatorColor,
} from "~/features/AccountManagement/utils/healthStatusUtils"
import {
  getTempWindowFallbackSettingsAnchor,
  getTempWindowFallbackSettingsTab,
} from "~/features/AccountManagement/utils/tempWindowFallbackReminder"
import { useLdohSiteLookupContext } from "~/features/LdohSiteLookup/hooks/LdohSiteLookupContext"
import { cn } from "~/lib/utils"
import {
  getSelectedCheckInStatus,
  inspectAccountCheckIn,
} from "~/services/checkin/autoCheckin/inspection"
import {
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type DisplaySiteData,
} from "~/types"
import { createTab } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"
import {
  openAccountBaseUrl,
  openCheckInAndRedeem,
  openCheckInPage,
  openCustomCheckInPage,
  openSettingsTab,
} from "~/utils/navigation"

interface SiteInfoProps {
  site: DisplaySiteData
  highlights?: SearchResultWithHighlight["highlights"]
  showCreatedAt?: boolean
}

const SITE_INFO_REFRESH_TARGETS = {
  STALE_CHECK_IN: "stale_check_in",
  HEALTH: "health",
} as const

type SiteInfoRefreshTarget =
  (typeof SITE_INFO_REFRESH_TARGETS)[keyof typeof SITE_INFO_REFRESH_TARGETS]

/**
 * Logger scoped to account list rows so navigation failures can be diagnosed without leaking account secrets.
 */
const logger = createLogger("AccountList.SiteInfo")

interface CheckInStatusButtonProps {
  checkedIn: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
  testId: string
}

/** Renders a check-in action with its source-specific icon and shared status color. */
function CheckInStatusButton({
  checkedIn,
  icon: Icon,
  label,
  onClick,
  testId,
}: CheckInStatusButtonProps) {
  return (
    <Tooltip
      content={label}
      position="top"
      wrapperClassName="flex items-center"
    >
      <IconButton
        onClick={onClick}
        variant="ghost"
        size="xs"
        aria-label={label}
        data-testid={testId}
      >
        <Icon
          className={cn(
            "h-4 w-4",
            checkedIn ? "text-green-500" : "text-red-500",
          )}
        />
      </IconButton>
    </Tooltip>
  )
}

/**
 * Renders highlighted fragments (such as search matches) with mark elements while preserving non-highlighted text.
 * Falls back to provided string when no highlight fragments exist.
 */
function renderHighlightedFragments(
  fragments: HighlightFragment[] | undefined,
  fallback: string,
) {
  if (!fragments || fragments.length === 0) {
    return fallback
  }

  return fragments.map((fragment, index) =>
    fragment.highlighted ? (
      <mark
        key={`${fragment.text}-${index}`}
        className="dark:text-dark-text-primary rounded bg-yellow-200 px-0.5 text-gray-900 dark:bg-yellow-500/30"
      >
        {fragment.text}
      </mark>
    ) : (
      <span key={`${fragment.text}-${index}`}>{fragment.text}</span>
    ),
  )
}

/**
 * Site info row combining metadata, status chips, and context actions for a display account entry.
 */
export default function SiteInfo({
  site,
  highlights,
  showCreatedAt = false,
}: SiteInfoProps) {
  const { t } = useTranslation(["account", "messages", "common"])
  const {
    detectedSiteAccounts,
    isAccountPinned,
    togglePinAccount,
    isPinFeatureEnabled,
  } = useAccountDataContext()
  const {
    handleRefreshAccount,
    refreshingAccountId,
    handleMarkCustomCheckInAsCheckedIn,
  } = useAccountActionsContext()
  const { getLdohSearchUrlForAccountUrl } = useLdohSiteLookupContext()
  const [activeRefreshTarget, setActiveRefreshTarget] =
    useState<SiteInfoRefreshTarget | null>(null)
  const isDetectedAccount = detectedSiteAccounts.some(
    (account) => account.id === site.id,
  )

  const isPinned = isAccountPinned(site.id)
  const pinTooltipLabel = isPinned ? t("actions.unpin") : t("actions.pin")
  const isRefreshing = refreshingAccountId === site.id
  const isRefreshLocked = isRefreshing || activeRefreshTarget !== null
  const isAccountDisabled = site.disabled === true
  const ldohSearchUrl = getLdohSearchUrlForAccountUrl(site.baseUrl)
  const customCheckInUrl = site.checkIn?.customCheckIn?.url
  const customRedeemUrl = site.checkIn?.customCheckIn?.redeemUrl
  const hasTags = Boolean(site.tags && site.tags.length > 0)
  const tagLabel = hasTags ? site.tags?.join(", ") || "" : ""
  const createdAtLabel = t("account:list.header.createdAt")
  const siteTypeLabel = t("list.site.siteType")
  const createdAtText = formatLocaleDateTime(
    site.created_at,
    t("common:labels.notAvailable"),
  )

  const healthCode = site.health?.code
  const canOpenHealthSettings =
    site.health?.status === SiteHealthStatus.Warning &&
    (healthCode === TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED ||
      healthCode === TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED)
  const healthSettingsTab =
    canOpenHealthSettings && healthCode
      ? getTempWindowFallbackSettingsTab(healthCode)
      : null
  const healthSettingsAnchor =
    canOpenHealthSettings && healthCode
      ? getTempWindowFallbackSettingsAnchor(healthCode)
      : undefined

  const handleOpenAccountSite = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await openAccountBaseUrl(site)
    } catch (error) {
      logger.error("Failed to open account base URL", {
        error,
        accountId: site.id,
        baseUrl: site.baseUrl,
      })
    }
  }

  const handleOpenLdoh = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!ldohSearchUrl) return
    try {
      await createTab(ldohSearchUrl, true)
    } catch (error) {
      const msg = getErrorMessage(error)
      logger.error("Failed to open LDOH site lookup", {
        error: msg,
        accountId: site.id,
        baseUrl: site.baseUrl,
      })
    }
  }

  const handlePinClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const success = await togglePinAccount(site.id)
    if (success) {
      const message = isPinned
        ? t("messages:toast.success.accountUnpinned", {
            accountName: site.name,
          })
        : t("messages:toast.success.accountPinned", {
            accountName: site.name,
          })
      toast.success(message)
    }
  }

  const handleSiteCheckIn = async () => {
    if (isAccountDisabled) return
    try {
      await openCheckInPage(site)
    } catch (error) {
      logger.error("Failed to handle check-in navigation", {
        error,
        accountId: site.id,
        baseUrl: site.baseUrl,
      })
    }
  }

  const handleCustomCheckIn = async () => {
    if (isAccountDisabled) return
    try {
      await handleMarkCustomCheckInAsCheckedIn(site)
      const shouldOpenRedeem =
        site.checkIn?.customCheckIn?.openRedeemWithCheckIn ?? true
      if (shouldOpenRedeem) {
        await openCheckInAndRedeem(site)
      } else {
        await openCustomCheckInPage(site)
      }
    } catch (error) {
      logger.error("Failed to handle custom check-in navigation", {
        error,
        accountId: site.id,
        baseUrl: site.baseUrl,
      })
    }
  }

  const handleAccountRefresh = async (target: SiteInfoRefreshTarget) => {
    if (isAccountDisabled || isRefreshLocked) return

    setActiveRefreshTarget(target)
    try {
      await handleRefreshAccount(site, true)
    } finally {
      setActiveRefreshTarget(null)
    }
  }

  const refreshAccount = (target: SiteInfoRefreshTarget) => {
    void handleAccountRefresh(target).catch((error) => {
      logger.error("Failed to refresh account row", {
        error,
        accountId: site.id,
        target,
      })
    })
  }

  const renderCheckInIndicators = () => {
    if (isAccountDisabled) {
      return null
    }

    const indicators: React.ReactNode[] = []

    const customUrl = site.checkIn?.customCheckIn?.url
    const hasCustomUrl =
      typeof customUrl === "string" && customUrl.trim() !== ""

    const checkInInspection = inspectAccountCheckIn({
      config: site.checkIn,
      siteType: site.siteType,
    })
    const selectedStatus = getSelectedCheckInStatus({
      config: site.checkIn,
      siteType: site.siteType,
    })
    const siteCheckedIn =
      selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
        ? selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked
          ? true
          : selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
            ? false
            : undefined
        : undefined
    const selectedStatusObservedAt =
      selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
        ? selectedStatus.evidence.source ===
          CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
          ? selectedStatus.evidence.legacyObservedAt
          : selectedStatus.evidence.observedAt
        : undefined

    if (
      checkInInspection.selectionState.status ===
      CHECK_IN_SELECTION_STATUSES.Selected
    ) {
      if (siteCheckedIn === undefined) {
        indicators.push(
          <Tooltip
            key="site-checkin"
            content={t("list.site.checkInStatusUnavailable")}
            position="top"
            wrapperClassName="flex items-center"
          >
            <TriangleAlert className="h-4 w-4 text-yellow-500" />
          </Tooltip>,
        )
      } else if (!isSelectedCheckInStatusCurrent(site)) {
        const staleStatusLabel = t("list.site.checkInStatusOutdated", {
          time: formatLocaleDateTime(
            selectedStatusObservedAt,
            t("list.site.notAvailable"),
          ),
        })
        indicators.push(
          <Tooltip
            key="site-checkin"
            content={staleStatusLabel}
            position="top"
            wrapperClassName="flex items-center"
          >
            <IconButton
              onClick={() =>
                refreshAccount(SITE_INFO_REFRESH_TARGETS.STALE_CHECK_IN)
              }
              variant="ghost"
              size="xs"
              loading={
                activeRefreshTarget === SITE_INFO_REFRESH_TARGETS.STALE_CHECK_IN
              }
              disabled={isRefreshLocked}
              aria-label={staleStatusLabel}
            >
              <TriangleAlert className="h-4 w-4 text-orange-500" />
            </IconButton>
          </Tooltip>,
        )
      } else if (siteCheckedIn) {
        indicators.push(
          <CheckInStatusButton
            key="site-checkin"
            checkedIn
            icon={CircleCheck}
            label={t("list.site.checkedInToday")}
            onClick={handleSiteCheckIn}
            testId={ACCOUNT_MANAGEMENT_TEST_IDS.siteCheckInStatusButton}
          />,
        )
      } else {
        indicators.push(
          <CheckInStatusButton
            key="site-checkin"
            checkedIn={false}
            icon={CircleX}
            label={t("list.site.notCheckedInToday")}
            onClick={handleSiteCheckIn}
            testId={ACCOUNT_MANAGEMENT_TEST_IDS.siteCheckInStatusButton}
          />,
        )
      }
    }

    if (hasCustomUrl) {
      const isCustomCheckedIn = site.checkIn.customCheckIn?.isCheckedInToday
      const customCheckInLabel = isCustomCheckedIn
        ? t("list.site.checkedInToday")
        : t("list.site.notCheckedInToday")
      indicators.push(
        <CheckInStatusButton
          key="custom-checkin"
          checkedIn={Boolean(isCustomCheckedIn)}
          icon={CircleDollarSign}
          label={customCheckInLabel}
          onClick={handleCustomCheckIn}
          testId={ACCOUNT_MANAGEMENT_TEST_IDS.customCheckInStatusButton}
        />,
      )
    }

    if (indicators.length === 0) {
      return null
    }

    return <div className="flex items-center gap-1">{indicators}</div>
  }

  const checkInIndicator = renderCheckInIndicators()
  const healthStatusDisplay = getHealthStatusDisplay(site.health?.status, t)

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className="flex shrink-0 flex-col items-center justify-center gap-2 self-stretch">
        <Tooltip
          content={
            <div className="space-y-1">
              <p>
                {t("list.site.status")}:{" "}
                <span className={healthStatusDisplay.color || "text-gray-400"}>
                  {healthStatusDisplay.text || t("list.site.unknown")}
                </span>
              </p>
              {site.health?.reason && (
                <p>
                  {t("list.site.reason")}:{" "}
                  {healthSettingsTab ? (
                    <WorkflowTransitionButton
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-left"
                      onClick={(e) => {
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
                      }}
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
            onClick={() => refreshAccount(SITE_INFO_REFRESH_TARGETS.HEALTH)}
            loading={activeRefreshTarget === SITE_INFO_REFRESH_TARGETS.HEALTH}
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

        {!isAccountDisabled && isPinFeatureEnabled && isPinned && (
          <Tooltip content={pinTooltipLabel} position="right">
            <IconButton
              onClick={handlePinClick}
              variant="ghost"
              size="none"
              aria-label={pinTooltipLabel}
            >
              <Pin
                className="dark:text-dark-text-tertiary h-3 w-3 -rotate-12 text-gray-400 transition-colors"
                aria-hidden="true"
              />
            </IconButton>
          </Tooltip>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {isDetectedAccount && (
              <Tooltip
                content={t("list.site.currentSiteExists")}
                position="top"
              >
                <Badge
                  variant="warning"
                  size="sm"
                  className="whitespace-nowrap"
                >
                  {t("list.site.currentSite")}
                </Badge>
              </Tooltip>
            )}
            {isAccountDisabled && (
              <Badge
                variant="secondary"
                size="sm"
                className="whitespace-nowrap"
              >
                {t("list.site.disabled")}
              </Badge>
            )}
            <Tooltip
              content={`${siteTypeLabel}: ${site.siteType}`}
              position="top"
            >
              <Badge
                variant="outline"
                size="sm"
                className="max-w-[10rem] shrink-0 truncate border-sky-200/80 bg-sky-50/70 whitespace-nowrap text-sky-700 dark:border-sky-700/50 dark:bg-sky-900/20 dark:text-sky-200"
              >
                {site.siteType}
              </Badge>
            </Tooltip>
          </div>

          <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
            {/* Keep the site URL clickable even when the account is disabled so users can still open the provider site. */}
            {/* Avoid `bleed`/non-shrinking button layout that can overflow into the action buttons column. */}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto min-w-0 flex-1 shrink justify-start p-0 text-left"
              title={site.name}
              onClick={handleOpenAccountSite}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.rowOpenButton}
            >
              <BodySmall weight="medium" className="truncate">
                {renderHighlightedFragments(highlights?.name, site.name)}
              </BodySmall>
            </Button>

            {checkInIndicator && (
              <div className="flex shrink-0 items-center">
                {checkInIndicator}
              </div>
            )}

            {ldohSearchUrl && (
              <Tooltip
                content={t("actions.viewOnLdoh")}
                position="top"
                wrapperClassName="flex shrink-0 items-center"
              >
                <IconButton
                  onClick={(e) => void handleOpenLdoh(e)}
                  variant="ghost"
                  size="xs"
                  aria-label={t("actions.viewOnLdoh")}
                  data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.rowLdohLookupButton}
                >
                  <span aria-hidden="true">
                    <LdohIcon />
                  </span>
                </IconButton>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="mt-0.5 flex min-w-0 items-start gap-1">
          <User className="dark:text-dark-text-tertiary mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
          <Caption className="truncate" title={site.username}>
            {highlights?.username && site.username
              ? renderHighlightedFragments(highlights.username, site.username)
              : site.username}
          </Caption>
        </div>

        {showCreatedAt && (
          <div className="mt-0.5 flex min-w-0 items-start gap-1">
            <CalendarDays className="dark:text-dark-text-tertiary mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <Caption
              className="truncate"
              title={`${createdAtLabel}: ${createdAtText}`}
            >
              {createdAtLabel}: {createdAtText}
            </Caption>
          </div>
        )}

        {highlights?.baseUrl && (
          <div className="mt-0.5 flex min-w-0 items-start gap-1">
            <Link className="dark:text-dark-text-tertiary mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <Caption className="truncate" title={site.baseUrl}>
              {renderHighlightedFragments(highlights.baseUrl, site.baseUrl)}
            </Caption>
          </div>
        )}

        {highlights?.customCheckInUrl && customCheckInUrl && (
          <div className="mt-0.5 flex min-w-0 items-start gap-1">
            <RefreshCw className="dark:text-dark-text-tertiary mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <Caption className="truncate" title={customCheckInUrl}>
              {renderHighlightedFragments(
                highlights.customCheckInUrl,
                customCheckInUrl,
              )}
            </Caption>
          </div>
        )}

        {highlights?.customRedeemUrl && customRedeemUrl && (
          <div className="mt-0.5 flex min-w-0 items-start gap-1">
            <Gift className="dark:text-dark-text-tertiary mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <Caption className="truncate" title={customRedeemUrl}>
              {renderHighlightedFragments(
                highlights.customRedeemUrl,
                customRedeemUrl,
              )}
            </Caption>
          </div>
        )}

        {site.notes && (
          <div className="mt-0.5 flex min-w-0 items-start gap-1 sm:mt-1">
            <SquarePen className="dark:text-dark-text-tertiary mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <Caption className="truncate" title={site.notes}>
              {site.notes}
            </Caption>
          </div>
        )}

        {hasTags && (
          <div className="mt-0.5 flex min-w-0 items-start gap-1 sm:mt-1">
            <Tag className="dark:text-dark-text-tertiary mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <Caption className="truncate" title={tagLabel}>
              {highlights?.tags
                ? renderHighlightedFragments(highlights.tags, tagLabel)
                : tagLabel}
            </Caption>
          </div>
        )}
      </div>
    </div>
  )
}
