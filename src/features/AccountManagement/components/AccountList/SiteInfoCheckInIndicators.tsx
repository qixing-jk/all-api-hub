import {
  Circle,
  CircleCheck,
  CircleDollarSign,
  TriangleAlert,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import { getAccountSiteApiRouter } from "~/constants/siteType"
import { isSelectedCheckInStatusCurrent } from "~/features/AccountManagement/components/AccountList/checkInFilter"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { cn } from "~/lib/utils"
import {
  getSelectedCheckInStatus,
  inspectAccountCheckIn,
} from "~/services/checkin/autoCheckin/inspection"
import type { DisplaySiteData } from "~/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"
import {
  openCheckInAndRedeem,
  openCheckInPage,
  openCustomCheckInPage,
} from "~/utils/navigation"

const logger = createLogger("AccountList.SiteInfo")

interface CheckInStatusButtonProps {
  checkedIn: boolean
  disabled?: boolean
  source: "site" | "custom"
  label: string
  onClick: () => void
  testId: string
}

/** Renders a check-in action with its source-specific icon and shared status color. */
function CheckInStatusButton({
  checkedIn,
  disabled,
  source,
  label,
  onClick,
  testId,
}: CheckInStatusButtonProps) {
  const Icon =
    source === "custom" ? CircleDollarSign : checkedIn ? CircleCheck : Circle
  const isEmptyCircle = source === "site" && !checkedIn
  return (
    <Tooltip
      content={label}
      position="top"
      wrapperClassName="flex items-center"
    >
      <IconButton
        onClick={onClick}
        disabled={disabled}
        variant="ghost"
        size="xs"
        aria-label={label}
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

type SiteCheckInIndicatorState =
  | { kind: "current"; checkedIn: boolean }
  | { kind: "outdated"; observedAt?: number }

/** Only known, enabled daily results can be displayed; unknown results stay hidden. */
function getSiteCheckInIndicatorState(
  site: DisplaySiteData,
): SiteCheckInIndicatorState | null {
  const input = {
    config: site.checkIn,
    siteType: site.siteType,
    siteUrl: site.baseUrl,
  }
  const { selectionState } = inspectAccountCheckIn(input)
  const status = getSelectedCheckInStatus(input)
  if (
    selectionState.status !== CHECK_IN_SELECTION_STATUSES.Selected ||
    status?.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known ||
    status.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled ||
    (status.today !== CHECK_IN_METHOD_TODAY_STATUSES.Checked &&
      status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked)
  ) {
    return null
  }
  if (isSelectedCheckInStatusCurrent(site)) {
    return {
      kind: "current",
      checkedIn: status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked,
    }
  }
  const observedAt =
    status.evidence.source ===
    CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
      ? status.evidence.legacyObservedAt
      : status.evidence.observedAt
  return { kind: "outdated", observedAt }
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

  if (isAccountDisabled) {
    return null
  }

  const customCheckIn = site.checkIn?.customCheckIn
  const hasCustomUrl =
    typeof customCheckIn?.url === "string" && customCheckIn.url.trim() !== ""
  const siteState = getSiteCheckInIndicatorState(site)
  if (!siteState && !hasCustomUrl) return null

  const staleStatusLabel =
    siteState?.kind === "outdated"
      ? t("list.site.checkInStatusOutdated", {
          time: formatLocaleDateTime(
            siteState.observedAt,
            t("list.site.notAvailable"),
          ),
        })
      : ""
  const checkInLabel = (checkedIn: boolean) =>
    checkedIn ? t("list.site.checkedInToday") : t("list.site.notCheckedInToday")

  return (
    <div className="flex shrink-0 items-center">
      <div className="gap-y-density-1 flex items-center gap-x-1">
        {siteState?.kind === "outdated" && (
          <Tooltip
            content={staleStatusLabel}
            position="top"
            wrapperClassName="flex items-center"
          >
            <IconButton
              onClick={onRefresh}
              variant="ghost"
              size="xs"
              loading={isRefreshing}
              disabled={isRefreshLocked}
              aria-label={staleStatusLabel}
            >
              <TriangleAlert className="text-warning-indicator h-4 w-4" />
            </IconButton>
          </Tooltip>
        )}
        {siteState?.kind === "current" && (
          <CheckInStatusButton
            source="site"
            checkedIn={siteState.checkedIn}
            label={checkInLabel(siteState.checkedIn)}
            onClick={() => void handleCheckIn("site")}
            disabled={!getAccountSiteApiRouter(site.siteType).checkInPath}
            testId={ACCOUNT_MANAGEMENT_TEST_IDS.siteCheckInStatusButton}
          />
        )}
        {hasCustomUrl && (
          <CheckInStatusButton
            source="custom"
            checkedIn={Boolean(customCheckIn?.isCheckedInToday)}
            label={checkInLabel(Boolean(customCheckIn?.isCheckedInToday))}
            onClick={() => void handleCheckIn("custom")}
            testId={ACCOUNT_MANAGEMENT_TEST_IDS.customCheckInStatusButton}
          />
        )}
      </div>
    </div>
  )
}
