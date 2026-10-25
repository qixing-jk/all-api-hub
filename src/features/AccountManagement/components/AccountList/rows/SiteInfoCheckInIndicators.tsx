import {
  Circle,
  CircleCheck,
  CircleDollarSign,
  CircleHelp,
  CircleMinus,
  Clock3,
  Settings2,
  TriangleAlert,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import { CHECK_IN_METHOD_TODAY_STATUSES } from "~/constants/checkIn"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountActionsContext } from "~/features/AccountManagement/actions/AccountActionsContext"
import {
  ACCOUNT_CHECK_IN_AUTOMATION_KINDS,
  CHECK_IN_CONFIGURATION_ACTIONS,
  getAccountCheckInAutomationState,
  getCheckInObservationTime,
  getSiteCheckInDisplayState,
  SITE_CHECK_IN_DISPLAY_KINDS,
} from "~/features/AccountManagement/checkInStatus"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/dialogs/useDialogStateContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { useCheckInRedetection } from "~/features/CheckIn/useCheckInRedetection"
import { cn } from "~/lib/utils"
import {
  getStaticAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { toAutoCheckinSkipReason } from "~/services/checkin/autoCheckin/skipReasons"
import type { DisplaySiteData } from "~/types"
import { translateAutoCheckinSkipReason } from "~/types/autoCheckin"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"
import {
  openCheckInAndRedeem,
  openCheckInPage,
  openCustomCheckInPage,
} from "~/utils/navigation/sitePages"

const logger = createLogger("AccountList.SiteInfo")

interface CheckInStatusButtonProps {
  checkedIn: boolean
  disabled?: boolean
  source: "site" | "custom"
  label: string
  description?: string
  onClick: () => void
  testId: string
}

/** Renders a check-in action with its source-specific icon and shared status color. */
function CheckInStatusButton({
  checkedIn,
  disabled,
  source,
  label,
  description,
  onClick,
  testId,
}: CheckInStatusButtonProps) {
  const Icon =
    source === "custom" ? CircleDollarSign : checkedIn ? CircleCheck : Circle
  const isEmptyCircle = source === "site" && !checkedIn
  return (
    <Tooltip
      content={[label, description].filter(Boolean).join(" · ")}
      position="top"
      wrapperClassName="flex items-center"
    >
      <IconButton
        onClick={onClick}
        disabled={disabled}
        variant="ghost"
        size="xs"
        aria-label={label}
        aria-description={description}
        data-testid={testId}
      >
        <Icon
          className={cn(
            // The empty circle looks larger without an inner glyph, so use 14px
            // beside the 16px detailed icons while keeping the same button hit area.
            isEmptyCircle ? "h-3.5 w-3.5" : "h-4 w-4",
            checkedIn ? "text-success-indicator" : "text-neutral-indicator",
          )}
        />
      </IconButton>
    </Tooltip>
  )
}

interface SiteInfoCheckInIndicatorsProps {
  site: DisplaySiteData
  isRefreshing: boolean
  isRefreshLocked: boolean
  onRefresh: () => void
}

/** Owns check-in visibility and navigation; the parent coordinates shared refresh locking. */
export function SiteInfoCheckInIndicators({
  site,
  isRefreshing,
  isRefreshLocked,
  onRefresh,
}: SiteInfoCheckInIndicatorsProps) {
  const { t } = useTranslation(["account", "messages", "common"])
  const { handleMarkCustomCheckInAsCheckedIn } = useAccountActionsContext()
  const { preferences } = useUserPreferencesContext()
  const { openEditAccount } = useDialogStateContext()
  const { loadAccountData } = useAccountDataContext()
  const {
    redetect,
    isPending: isRedetecting,
    selectionDialog,
  } = useCheckInRedetection(site.id, loadAccountData)
  const automation = getAccountCheckInAutomationState(
    site,
    preferences?.autoCheckin?.globalEnabled ?? true,
  )
  const reasonLabel = (reason: Parameters<typeof toAutoCheckinSkipReason>[0]) =>
    translateAutoCheckinSkipReason(t, toAutoCheckinSkipReason(reason))
  const automationDescription = (() => {
    switch (automation.kind) {
      case ACCOUNT_CHECK_IN_AUTOMATION_KINDS.AccountDisabled:
        return t("list.site.checkInAccountDisabled")
      case ACCOUNT_CHECK_IN_AUTOMATION_KINDS.GloballyDisabled:
        return t("list.site.checkInAutomationGloballyDisabled")
      case ACCOUNT_CHECK_IN_AUTOMATION_KINDS.Disabled:
        return t("list.site.checkInAutomationDisabled")
      case ACCOUNT_CHECK_IN_AUTOMATION_KINDS.Enabled:
        return t("list.site.checkInAutomationEnabled")
      case ACCOUNT_CHECK_IN_AUTOMATION_KINDS.Blocked:
        return t("list.site.checkInAutomationBlocked", {
          reason: reasonLabel(automation.reason),
        })
    }
  })()
  const isAccountDisabled = site.disabled === true

  const handleCheckIn = async (source: "site" | "custom") => {
    if (isAccountDisabled) return
    try {
      if (source === "site") {
        await openCheckInPage(site)
        return
      }
      await handleMarkCustomCheckInAsCheckedIn(site)
      const shouldOpenRedeem =
        site.checkIn?.customCheckIn?.openRedeemWithCheckIn ?? true
      if (shouldOpenRedeem) {
        await openCheckInAndRedeem(site)
      } else {
        await openCustomCheckInPage(site)
      }
    } catch (error) {
      logger.error(
        source === "site"
          ? "Failed to handle check-in navigation"
          : "Failed to handle custom check-in navigation",
        {
          error,
          accountId: site.id,
          baseUrl: site.baseUrl,
        },
      )
    }
  }

  const customCheckIn = site.checkIn?.customCheckIn
  const hasCustomUrl =
    typeof customCheckIn?.url === "string" && customCheckIn.url.trim() !== ""
  const siteState = getSiteCheckInDisplayState(site)
  if (!siteState && !hasCustomUrl) return null

  const formatTime = (time?: number) =>
    formatLocaleDateTime(time, t("list.site.notAvailable"))
  const statusLabel = (() => {
    switch (siteState?.kind) {
      case SITE_CHECK_IN_DISPLAY_KINDS.Configuration:
        return siteState.action === CHECK_IN_CONFIGURATION_ACTIONS.Redetect
          ? t("list.site.checkInNeedsRedetection", {
              reason: reasonLabel(siteState.reason),
            })
          : t("list.site.checkInNeedsConfiguration", {
              reason: reasonLabel(siteState.reason),
            })
      case SITE_CHECK_IN_DISPLAY_KINDS.SiteDisabled:
        return t("list.site.checkInSiteDisabled")
      case SITE_CHECK_IN_DISPLAY_KINDS.Outdated:
        return t("list.site.checkInStatusOutdated", {
          time: formatTime(siteState.observedAt),
        })
      case SITE_CHECK_IN_DISPLAY_KINDS.Failed: {
        const failure = t("list.site.checkInStatusFailed", {
          time: formatTime(siteState.attemptedAt),
        })
        if (!siteState.lastKnown?.today) return failure
        const time = formatTime(getCheckInObservationTime(siteState.lastKnown))
        const previous =
          siteState.lastKnown.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked
            ? t("list.site.checkInLastKnownChecked", { time })
            : t("list.site.checkInLastKnownNotChecked", { time })
        return `${failure} · ${previous}`
      }
      case SITE_CHECK_IN_DISPLAY_KINDS.Manual:
        return t("list.site.checkInStatusManual")
      default:
        return t("list.site.checkInStatusPending")
    }
  })()
  const StatusIcon =
    siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.Configuration
      ? Settings2
      : siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.SiteDisabled
        ? CircleMinus
        : siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.Failed
          ? TriangleAlert
          : siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.Manual
            ? CircleHelp
            : Clock3
  const manual =
    siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.Manual ||
    siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.SiteDisabled
  const configuration =
    siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.Configuration
  const warning =
    siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.Failed ||
    ((configuration ||
      siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.SiteDisabled) &&
      automation.kind === ACCOUNT_CHECK_IN_AUTOMATION_KINDS.Blocked)
  const checkInLabel = (checkedIn: boolean) =>
    checkedIn ? t("list.site.checkedInToday") : t("list.site.notCheckedInToday")

  return (
    <>
      {selectionDialog}
      <div className="flex shrink-0 items-center">
        <div className="gap-y-density-1 flex items-center gap-x-1">
          {siteState &&
            siteState.kind !== SITE_CHECK_IN_DISPLAY_KINDS.Current && (
              <Tooltip
                content={[statusLabel, automationDescription].join(" · ")}
                position="top"
                wrapperClassName="flex items-center"
              >
                <IconButton
                  onClick={(event) => {
                    if (
                      siteState.kind ===
                      SITE_CHECK_IN_DISPLAY_KINDS.Configuration
                    ) {
                      if (
                        siteState.action ===
                        CHECK_IN_CONFIGURATION_ACTIONS.Redetect
                      )
                        void redetect(event.currentTarget)
                      else
                        openEditAccount(site, {
                          focusSection: "check-in",
                        })
                    } else if (manual) void handleCheckIn("site")
                    else onRefresh()
                  }}
                  variant="ghost"
                  size="xs"
                  loading={
                    configuration ? isRedetecting : !manual && isRefreshing
                  }
                  disabled={
                    configuration
                      ? isRefreshLocked ||
                        isRedetecting ||
                        (isAccountDisabled &&
                          siteState.action ===
                            CHECK_IN_CONFIGURATION_ACTIONS.Redetect)
                      : isAccountDisabled ||
                        (manual
                          ? !getStaticAccountSiteRouteUrl(
                              site,
                              SITE_ROUTE_KINDS.CheckIn,
                            )
                          : isRefreshLocked || isRedetecting)
                  }
                  aria-label={statusLabel}
                  aria-description={automationDescription}
                >
                  <StatusIcon
                    className={cn(
                      "h-4 w-4",
                      warning
                        ? "text-warning-indicator"
                        : "text-neutral-indicator",
                    )}
                  />
                </IconButton>
              </Tooltip>
            )}
          {siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.Current && (
            <CheckInStatusButton
              source="site"
              checkedIn={siteState.checkedIn}
              label={checkInLabel(siteState.checkedIn)}
              description={automationDescription}
              onClick={() => void handleCheckIn("site")}
              disabled={
                isAccountDisabled ||
                !getStaticAccountSiteRouteUrl(site, SITE_ROUTE_KINDS.CheckIn)
              }
              testId={ACCOUNT_MANAGEMENT_TEST_IDS.siteCheckInStatusButton}
            />
          )}
          {hasCustomUrl && (
            <CheckInStatusButton
              source="custom"
              disabled={isAccountDisabled}
              checkedIn={Boolean(customCheckIn?.isCheckedInToday)}
              label={checkInLabel(Boolean(customCheckIn?.isCheckedInToday))}
              onClick={() => void handleCheckIn("custom")}
              testId={ACCOUNT_MANAGEMENT_TEST_IDS.customCheckInStatusButton}
            />
          )}
        </div>
      </div>
    </>
  )
}
