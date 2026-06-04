import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  AUTO_CHECKIN_RUN_RESULT,
  type AutoCheckinStatus,
} from "~/types/autoCheckin"

import {
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES as AUTO_CHECKIN_PANEL_STATUSES,
  OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS,
} from "./ids"
import type {
  OptionsOverviewAutoCheckinAction,
  OptionsOverviewAutoCheckinPanel,
  OptionsOverviewSeverity,
} from "./types"

type AutoCheckinPanelStatus = OptionsOverviewAutoCheckinPanel["status"]
type AutoCheckinRunResult = NonNullable<AutoCheckinStatus["lastRunResult"]>

const autoCheckinRunResultStatusMap = {
  [AUTO_CHECKIN_RUN_RESULT.FAILED]: AUTO_CHECKIN_PANEL_STATUSES.failed,
  [AUTO_CHECKIN_RUN_RESULT.PARTIAL]: AUTO_CHECKIN_PANEL_STATUSES.partial,
  [AUTO_CHECKIN_RUN_RESULT.SUCCESS]: AUTO_CHECKIN_PANEL_STATUSES.success,
} as const satisfies Record<AutoCheckinRunResult, AutoCheckinPanelStatus>

const autoCheckinPanelSeverityMap = {
  [AUTO_CHECKIN_PANEL_STATUSES.failed]: "error",
  [AUTO_CHECKIN_PANEL_STATUSES.partial]: "warning",
  [AUTO_CHECKIN_PANEL_STATUSES.disabled]: "info",
  [AUTO_CHECKIN_PANEL_STATUSES.notRun]: "info",
  [AUTO_CHECKIN_PANEL_STATUSES.ready]: "success",
  [AUTO_CHECKIN_PANEL_STATUSES.success]: "success",
} as const satisfies Record<AutoCheckinPanelStatus, OptionsOverviewSeverity>

/**
 * Builds the auto check-in operational panel from persisted local run status.
 */
export function buildAutoCheckinPanel(input: {
  preferences: UserPreferences | null | undefined
  status: AutoCheckinStatus | null | undefined
}): OptionsOverviewAutoCheckinPanel {
  const isEnabled = input.preferences?.autoCheckin?.globalEnabled !== false
  const summary = input.status?.summary
  const status = resolveAutoCheckinPanelStatus({
    isEnabled,
    lastRunResult: input.status?.lastRunResult,
  })
  const needsRetry = Boolean(summary?.needsRetry || input.status?.pendingRetry)

  return {
    status,
    severity: resolveAutoCheckinPanelSeverity(status),
    totalEligible: summary?.totalEligible ?? 0,
    executed: summary?.executed ?? 0,
    successCount: summary?.successCount ?? 0,
    failedCount: summary?.failedCount ?? 0,
    skippedCount: summary?.skippedCount ?? 0,
    needsRetry,
    lastRunAt: input.status?.lastRunAt,
    nextRunAt:
      input.status?.nextDailyScheduledAt ?? input.status?.nextScheduledAt,
    nextRetryAt: input.status?.nextRetryScheduledAt,
    actions: buildAutoCheckinActions({ needsRetry }),
  }
}

/**
 * Resolves persisted auto check-in run results into the panel status contract.
 */
function resolveAutoCheckinPanelStatus(input: {
  isEnabled: boolean
  lastRunResult: AutoCheckinStatus["lastRunResult"] | undefined
}): OptionsOverviewAutoCheckinPanel["status"] {
  if (!input.isEnabled) return AUTO_CHECKIN_PANEL_STATUSES.disabled

  return input.lastRunResult
    ? autoCheckinRunResultStatusMap[input.lastRunResult]
    : AUTO_CHECKIN_PANEL_STATUSES.notRun
}

/**
 * Maps panel status to the shared overview severity scale.
 */
function resolveAutoCheckinPanelSeverity(
  status: OptionsOverviewAutoCheckinPanel["status"],
): OptionsOverviewSeverity {
  return autoCheckinPanelSeverityMap[status]
}

/**
 * Keeps retry visibility close to the normalized retry condition.
 */
function buildAutoCheckinActions(input: {
  needsRetry: boolean
}): OptionsOverviewAutoCheckinAction[] {
  const actions: OptionsOverviewAutoCheckinAction[] = [
    {
      id: OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.openAutoCheckin,
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      isVisible: true,
    },
    {
      id: OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS.retryFailed,
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      isVisible: input.needsRetry,
    },
  ]

  return actions.filter((action) => action.isVisible)
}
