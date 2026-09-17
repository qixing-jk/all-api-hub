import { CHECK_IN_SELECTION_STATUSES } from "~/constants/checkIn"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { isUnknownAccountSiteType } from "~/constants/siteType"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import { SiteHealthStatus, type DisplaySiteData } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinStatus,
  type CheckinAccountResult,
} from "~/types/autoCheckin"

import { OPTIONS_OVERVIEW_ATTENTION_KINDS } from "./ids"
import {
  buildAccountNavigationTarget,
  buildBasicSettingsAnchorTarget,
} from "./navigationTargets"
import type {
  OptionsOverviewAttentionItem,
  OptionsOverviewSeverity,
} from "./types"

/**
 * Skipped results that need an explicit user step on the site or account.
 * Method-selection reasons stay out: the per-account check-in items already
 * derive those from the current configuration, so a stale run would duplicate.
 */
const CHECKIN_SKIP_REASONS_NEEDING_USER_ACTION = [
  AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING,
  AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
  AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
  AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED,
] as const

const SEVERITY_ORDER: Record<
  Exclude<OptionsOverviewSeverity, "success">,
  number
> = {
  error: 0,
  warning: 1,
  info: 2,
}

/**
 * Creates actionable setup and health items ordered by user impact.
 */
export function buildAttentionItems(input: {
  enabledAccountCount: number
  profileCount: number
  problemAccounts: DisplaySiteData[]
  accounts?: DisplaySiteData[]
  autoCheckinStatus?: AutoCheckinStatus | null
  globalAutomaticExecutionEnabled?: boolean
  usageRefreshPendingCount?: number
  unreadAnnouncementCount?: number
  accountsDataAvailable?: boolean
  profilesDataAvailable?: boolean
}): OptionsOverviewAttentionItem[] {
  const items: OptionsOverviewAttentionItem[] = input.problemAccounts.map(
    (account) => ({
      id: `account:${account.id}:${account.health.status}`,
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
      severity:
        account.health.status === SiteHealthStatus.Error ? "error" : "warning",
      titleOptions: { name: account.name },
      descriptionOptions: { reason: account.health.reason },
      target: buildAccountNavigationTarget(account.id),
    }),
  )

  const automaticExecutionEnabled =
    input.globalAutomaticExecutionEnabled !== false
  const accounts = input.accounts ?? []
  if (automaticExecutionEnabled) {
    for (const account of accounts) {
      if (
        account.disabled === true ||
        account.checkIn?.automaticExecutionEnabled !== true
      ) {
        continue
      }

      const checkInState = inspectAccountCheckIn({
        config: account.checkIn,
        siteType: account.siteType,
        siteUrl: account.baseUrl,
        accountDisabled: account.disabled,
        globalAutomaticExecutionEnabled: automaticExecutionEnabled,
      })
      if (
        checkInState.selectionState.status ===
        CHECK_IN_SELECTION_STATUSES.Selected
      ) {
        continue
      }

      items.push(
        isUnknownAccountSiteType(account.siteType)
          ? {
              id: `checkin:${account.id}:site-type-unknown`,
              kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeUnknown,
              severity: "warning",
              titleOptions: { name: account.name },
              target: buildAccountNavigationTarget(account.id),
            }
          : {
              id: `checkin:${account.id}:method-unresolved`,
              kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved,
              severity: "warning",
              titleOptions: { name: account.name },
              target: buildAccountNavigationTarget(account.id),
            },
      )
    }

    const autoCheckinAttentionItem = buildAutoCheckinAttentionItem(
      input.autoCheckinStatus,
    )
    if (autoCheckinAttentionItem) {
      items.push(autoCheckinAttentionItem)
    }

    const skippedCheckInCount = countSkippedCheckInsNeedingAction(
      input.autoCheckinStatus,
    )
    if (skippedCheckInCount > 0) {
      items.push({
        id: "auto-checkin:skipped-needs-action",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInSkippedNeedsAction,
        severity: "warning",
        titleOptions: { total: skippedCheckInCount },
        target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      })
    }
  } else {
    const pausedAccountCount = accounts.filter(
      (account) =>
        account.disabled !== true &&
        account.checkIn?.automaticExecutionEnabled === true,
    ).length
    if (pausedAccountCount > 0) {
      items.push({
        id: "auto-checkin:globally-disabled",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinGloballyDisabled,
        severity: "warning",
        descriptionOptions: { total: pausedAccountCount },
        target: buildBasicSettingsAnchorTarget(SETTINGS_ANCHORS.AUTO_CHECKIN),
      })
    }
  }

  if (
    input.accountsDataAvailable !== false &&
    (input.usageRefreshPendingCount ?? 0) > 0
  ) {
    items.push({
      id: "usage:pending-refresh",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending,
      severity: "info",
      titleOptions: { total: input.usageRefreshPendingCount },
      target: buildAccountNavigationTarget(),
    })
  }

  const unreadAnnouncementCount = input.unreadAnnouncementCount ?? 0
  if (unreadAnnouncementCount > 0) {
    items.push({
      id: "announcements:unread",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.unreadSiteAnnouncements,
      severity: "info",
      titleOptions: { total: unreadAnnouncementCount },
      target: { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
    })
  }

  if (
    input.accountsDataAvailable !== false &&
    input.enabledAccountCount === 0
  ) {
    items.push({
      id: "setup:add-account",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount,
      severity: "info",
      target: buildAccountNavigationTarget(),
    })
  }

  if (input.profilesDataAvailable !== false && input.profileCount === 0) {
    items.push({
      id: "setup:add-profile",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile,
      severity: "info",
      target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
    })
  }

  return items.sort((left, right) => {
    const severityDiff =
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    if (severityDiff !== 0) return severityDiff
    return left.id.localeCompare(right.id)
  })
}

/**
 * Counts skipped results whose reason needs a user-provided fix.
 */
function countSkippedCheckInsNeedingAction(
  status: AutoCheckinStatus | null | undefined,
): number {
  const results: CheckinAccountResult[] = Object.values(
    status?.perAccount ?? {},
  )

  return results.filter(
    (result) =>
      result.status === CHECKIN_RESULT_STATUS.SKIPPED &&
      CHECKIN_SKIP_REASONS_NEEDING_USER_ACTION.some(
        (reason) => reason === result.reasonCode,
      ),
  ).length
}

/**
 * Collapses failed and uncertain account results into one actionable run item.
 */
function buildAutoCheckinAttentionItem(
  status: AutoCheckinStatus | null | undefined,
): OptionsOverviewAttentionItem | null {
  if (!status) return null

  const results = Object.values(status.perAccount ?? {})
  const resultFailedCount = results.filter(
    (result) => result.status === CHECKIN_RESULT_STATUS.FAILED,
  ).length
  const resultUncertainCount = results.filter(
    (result) => result.status === CHECKIN_RESULT_STATUS.UNCERTAIN,
  ).length
  const failedCount = Math.max(
    status.summary?.failedCount ?? 0,
    resultFailedCount,
  )
  const uncertainCount = Math.max(
    status.summary?.uncertainCount ?? 0,
    resultUncertainCount,
  )
  const count = failedCount + uncertainCount
  if (count === 0) return null

  return {
    id: "auto-checkin:needs-attention",
    kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinNeedsAttention,
    severity: failedCount > 0 ? "error" : "warning",
    titleOptions: { total: count },
    target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
  }
}
