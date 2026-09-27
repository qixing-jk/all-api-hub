import { CHECK_IN_SELECTION_STATUSES } from "~/constants/checkIn"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { isUnknownAccountSiteType } from "~/constants/siteType"
import {
  getTempWindowFallbackSettingsAnchor,
  getTempWindowFallbackSettingsTab,
  isTempWindowFallbackReminderCode,
} from "~/features/AccountManagement/utils/tempWindowFallbackReminder"
import { isAutoCheckinSkipReasonActionable } from "~/features/AutoCheckin/utils/skipCategories"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import { SiteHealthStatus, type DisplaySiteData } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
  type AutoCheckinStatus,
  type CheckinAccountResult,
} from "~/types/autoCheckin"

import {
  OPTIONS_OVERVIEW_ATTENTION_CATEGORIES,
  OPTIONS_OVERVIEW_ATTENTION_KINDS,
} from "./ids"
import {
  buildAccountNavigationTarget,
  buildBasicSettingsAnchorTarget,
  buildTempWindowSettingsTarget,
} from "./navigationTargets"
import type {
  OptionsOverviewAttentionItem,
  OptionsOverviewSeverity,
} from "./types"

/**
 * Skipped reasons grouped into user-facing todos. Method-selection reasons stay
 * out: the per-account check-in items already derive those from the current
 * configuration, so a stale run would duplicate them.
 */
const CHECKIN_SKIP_TODO_GROUPS = [
  {
    id: "auto-checkin:relogin-required",
    kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInReloginRequired,
    reasons: [AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED],
  },
  {
    id: "auto-checkin:account-data-missing",
    kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInAccountDataMissing,
    reasons: [
      AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING,
      AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
    ],
  },
  {
    id: "auto-checkin:permission-denied",
    kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInPermissionDenied,
    reasons: [AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED],
  },
] as const satisfies readonly {
  id: string
  kind: OptionsOverviewAttentionItem["kind"]
  reasons: readonly AutoCheckinSkipReason[]
}[]

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
  totalAccountCount?: number
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
    (account) => {
      const healthCode = account.health.code ?? null
      if (isTempWindowFallbackReminderCode(healthCode)) {
        return {
          id: `account:${account.id}:temp-window`,
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountTempWindowIssue,
          category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
          severity: "warning",
          titleOptions: { name: account.name },
          descriptionOptions: { reason: account.health.reason },
          target: buildTempWindowSettingsTarget({
            settingsTab: getTempWindowFallbackSettingsTab(healthCode),
            settingsAnchor: getTempWindowFallbackSettingsAnchor(healthCode),
          }),
        }
      }

      return {
        id: `account:${account.id}:${account.health.status}`,
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
        severity:
          account.health.status === SiteHealthStatus.Error
            ? "error"
            : "warning",
        titleOptions: { name: account.name },
        descriptionOptions: { reason: account.health.reason },
        target: buildAccountNavigationTarget(account.id),
      }
    },
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

      if (isUnknownAccountSiteType(account.siteType)) {
        items.push({
          id: `checkin:${account.id}:site-type-unknown`,
          kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeUnknown,
          category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
          severity: "warning",
          titleOptions: { name: account.name },
          target: buildAccountNavigationTarget(account.id),
        })
        continue
      }

      // Site types without a registered check-in method are unsupported, not a
      // user-fixable setup gap.
      if (checkInState.choices.length === 0) {
        continue
      }

      items.push({
        id: `checkin:${account.id}:method-unresolved`,
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
        severity: "warning",
        titleOptions: { name: account.name },
        target: buildAccountNavigationTarget(account.id),
      })
    }

    const autoCheckinAttentionItem = buildAutoCheckinAttentionItem(
      input.autoCheckinStatus,
    )
    if (autoCheckinAttentionItem) {
      items.push(autoCheckinAttentionItem)
    }

    const skippedReasons = collectSkippedReasonCounts(input.autoCheckinStatus)
    for (const group of CHECKIN_SKIP_TODO_GROUPS) {
      const total = group.reasons.reduce(
        (count, reason) => count + (skippedReasons.get(reason) ?? 0),
        0,
      )
      if (total === 0) continue

      items.push({
        id: group.id,
        kind: group.kind,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
        severity: "warning",
        titleOptions: { total },
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
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
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
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.data,
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
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
      severity: "info",
      titleOptions: { total: unreadAnnouncementCount },
      target: { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
    })
  }

  if (input.accountsDataAvailable !== false) {
    const totalAccountCount =
      input.totalAccountCount ?? input.enabledAccountCount
    if (totalAccountCount === 0) {
      items.push({
        id: "setup:add-account",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
        severity: "info",
        target: buildAccountNavigationTarget(),
      })
    } else if (input.enabledAccountCount === 0) {
      items.push({
        id: "accounts:all-disabled",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountsAllDisabled,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
        severity: "info",
        titleOptions: { total: totalAccountCount },
        target: buildAccountNavigationTarget(),
      })
    }
  }

  if (input.profilesDataAvailable !== false && input.profileCount === 0) {
    items.push({
      id: "setup:add-profile",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.credentials,
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
 * Counts skipped results per reason for the latest persisted run.
 */
function collectSkippedReasonCounts(
  status: AutoCheckinStatus | null | undefined,
): Map<AutoCheckinSkipReason, number> {
  const counts = new Map<AutoCheckinSkipReason, number>()
  const results: CheckinAccountResult[] = Object.values(
    status?.perAccount ?? {},
  )

  for (const result of results) {
    if (result.status !== CHECKIN_RESULT_STATUS.SKIPPED) continue
    const reason = result.reasonCode
    if (!isAutoCheckinSkipReasonActionable(reason)) continue

    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }

  return counts
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
    category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
    severity: failedCount > 0 ? "error" : "warning",
    titleOptions: { total: count },
    target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
  }
}
