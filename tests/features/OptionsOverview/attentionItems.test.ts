import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { buildAttentionItems } from "~/features/OptionsOverview/attentionItems"
import {
  OPTIONS_OVERVIEW_ATTENTION_CATEGORIES,
  OPTIONS_OVERVIEW_ATTENTION_KINDS,
} from "~/features/OptionsOverview/ids"
import {
  SiteHealthStatus,
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type DisplaySiteData,
} from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
  type AutoCheckinStatus,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import {
  buildCheckInConfig,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const problemAccount = (
  id: string,
  status: SiteHealthStatus.Error | SiteHealthStatus.Warning,
  reason?: string,
): DisplaySiteData =>
  ({
    id,
    name: `Relay ${id}`,
    health: {
      status,
      reason,
    },
  }) as DisplaySiteData

const skippedResult = (
  accountId: string,
  reasonCode: AutoCheckinSkipReason,
): CheckinAccountResult => ({
  accountId,
  accountName: accountId,
  status: CHECKIN_RESULT_STATUS.SKIPPED,
  reasonCode,
  timestamp: 1,
})

describe("overview attention items", () => {
  it("turns unhealthy accounts into sorted actionable attention items", () => {
    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [
          problemAccount("warning-account", SiteHealthStatus.Warning),
          problemAccount("error-b", SiteHealthStatus.Error, "sync failed"),
          problemAccount("error-a", SiteHealthStatus.Error, "token expired"),
        ],
      }),
    ).toEqual([
      {
        id: "account:error-a:error",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
        severity: "error",
        titleOptions: { name: "Relay error-a" },
        descriptionOptions: { reason: "token expired" },
        target: {
          menuItemId: MENU_ITEM_IDS.ACCOUNT,
          params: { search: "error-a" },
        },
      },
      {
        id: "account:error-b:error",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
        severity: "error",
        titleOptions: { name: "Relay error-b" },
        descriptionOptions: { reason: "sync failed" },
        target: {
          menuItemId: MENU_ITEM_IDS.ACCOUNT,
          params: { search: "error-b" },
        },
      },
      {
        id: "account:warning-account:warning",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountUnhealthy,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
        severity: "warning",
        titleOptions: { name: "Relay warning-account" },
        descriptionOptions: { reason: undefined },
        target: {
          menuItemId: MENU_ITEM_IDS.ACCOUNT,
          params: { search: "warning-account" },
        },
      },
    ])
  })

  it("adds setup hints when accounts or credential profiles are missing", () => {
    expect(
      buildAttentionItems({
        enabledAccountCount: 0,
        profileCount: 0,
        problemAccounts: [],
      }),
    ).toEqual([
      {
        id: "setup:add-account",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addAccount,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
        severity: "info",
        target: {
          menuItemId: MENU_ITEM_IDS.ACCOUNT,
          params: undefined,
        },
      },
      {
        id: "setup:add-profile",
        kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.addProfile,
        category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.credentials,
        severity: "info",
        target: {
          menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
        },
      },
    ])
  })

  it("sorts setup hints after higher-severity account problems", () => {
    expect(
      buildAttentionItems({
        enabledAccountCount: 0,
        profileCount: 0,
        problemAccounts: [
          problemAccount("warning-account", SiteHealthStatus.Warning),
        ],
      }).map((item) => [item.id, item.severity]),
    ).toEqual([
      ["account:warning-account:warning", "warning"],
      ["setup:add-account", "info"],
      ["setup:add-profile", "info"],
    ])
  })

  it("flags unknown site types when their automatic check-in method is unresolved", () => {
    const account = buildDisplaySiteData({
      id: "unknown-account",
      name: "Unknown Relay",
      siteType: SITE_TYPES.UNKNOWN,
      checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
    })

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        accounts: [account],
        globalAutomaticExecutionEnabled: true,
      }),
    ).toContainEqual({
      id: "checkin:unknown-account:site-type-unknown",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeUnknown,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
      severity: "warning",
      titleOptions: { name: "Unknown Relay" },
      target: {
        menuItemId: MENU_ITEM_IDS.ACCOUNT,
        params: { search: "unknown-account" },
      },
    })
  })

  it("flags known site types whose automatic check-in method is unresolved", () => {
    const account = buildDisplaySiteData({
      id: "new-api-account",
      name: "New API Relay",
      siteType: SITE_TYPES.NEW_API,
      checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
    })

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        accounts: [account],
        globalAutomaticExecutionEnabled: true,
      }),
    ).toContainEqual({
      id: "checkin:new-api-account:method-unresolved",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInMethodUnresolved,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
      severity: "warning",
      titleOptions: { name: "New API Relay" },
      target: {
        menuItemId: MENU_ITEM_IDS.ACCOUNT,
        params: { search: "new-api-account" },
      },
    })
  })

  it("does not flag check-in setup when automatic execution is disabled", () => {
    const account = buildDisplaySiteData({
      id: "manual-account",
      name: "Manual Relay",
      siteType: SITE_TYPES.UNKNOWN,
      checkIn: buildCheckInConfig({ automaticExecutionEnabled: false }),
    })

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        accounts: [account],
        globalAutomaticExecutionEnabled: true,
      }).map((item) => item.id),
    ).not.toContain("checkin:manual-account:site-type-unknown")
  })

  it("names the site type an account's failed run should be switched to", () => {
    const account = buildDisplaySiteData({
      id: "mismatch-account",
      name: "Mismatch relay",
      siteType: SITE_TYPES.NEW_API,
    })

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 0,
        problemAccounts: [],
        accounts: [account],
        siteTypeMismatches: {
          [account.id]: {
            storedSiteType: SITE_TYPES.NEW_API,
            suggestedSiteType: SITE_TYPES.VELOERA,
          },
        },
      }),
    ).toContainEqual({
      id: `checkin:${account.id}:site-type-mismatch`,
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.siteTypeMismatch,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
      severity: "warning",
      titleOptions: { name: account.name },
      descriptionOptions: {
        storedType: SITE_TYPES.NEW_API,
        suggestedType: SITE_TYPES.VELOERA,
      },
      target: expect.anything(),
    })
  })

  it("names a site type mismatch only for an account it belongs to", () => {
    const account = buildDisplaySiteData({
      id: "listed-account",
      name: "Listed relay",
      siteType: SITE_TYPES.NEW_API,
    })

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 0,
        problemAccounts: [],
        accounts: [account],
        siteTypeMismatches: {
          "hidden-account": {
            storedSiteType: SITE_TYPES.NEW_API,
            suggestedSiteType: SITE_TYPES.VELOERA,
          },
        },
      }).map((item) => item.id),
    ).not.toContain("checkin:hidden-account:site-type-mismatch")
  })

  it("adds one aggregate item for failed or uncertain check-in results", () => {
    const autoCheckinStatus: AutoCheckinStatus = {
      summary: {
        totalEligible: 4,
        executed: 4,
        successCount: 2,
        failedCount: 1,
        skippedCount: 0,
        uncertainCount: 1,
        needsRetry: true,
      },
    }

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        autoCheckinStatus,
        globalAutomaticExecutionEnabled: true,
      }),
    ).toContainEqual({
      id: "auto-checkin:needs-attention",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinNeedsAttention,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
      severity: "error",
      titleOptions: { total: 2 },
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
    })
  })

  it("adds a refresh item when today's stats still need confirmation", () => {
    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        usageRefreshPendingCount: 2,
      }),
    ).toContainEqual({
      id: "usage:pending-refresh",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.usageRefreshPending,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.data,
      severity: "info",
      titleOptions: { total: 2 },
      target: { menuItemId: MENU_ITEM_IDS.ACCOUNT, params: undefined },
    })
  })

  it("flags accounts paused by the global auto check-in switch", () => {
    const accounts = [
      buildDisplaySiteData({
        id: "paused-a",
        name: "Paused A",
        checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
      }),
      buildDisplaySiteData({
        id: "paused-b",
        name: "Paused B",
        checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
      }),
      buildDisplaySiteData({
        id: "manual-account",
        name: "Manual Relay",
        checkIn: buildCheckInConfig({ automaticExecutionEnabled: false }),
      }),
      buildDisplaySiteData({
        id: "disabled-account",
        name: "Disabled Relay",
        disabled: true,
        checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
      }),
    ]

    const items = buildAttentionItems({
      enabledAccountCount: 3,
      profileCount: 1,
      problemAccounts: [],
      accounts,
      globalAutomaticExecutionEnabled: false,
    })

    expect(items).toContainEqual({
      id: "auto-checkin:globally-disabled",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.autoCheckinGloballyDisabled,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
      severity: "warning",
      descriptionOptions: { total: 2 },
      target: {
        menuItemId: MENU_ITEM_IDS.BASIC,
        params: {
          anchor: SETTINGS_ANCHORS.AUTO_CHECKIN,
          highlight: SETTINGS_ANCHORS.AUTO_CHECKIN,
          tab: "checkinRedeem",
        },
      },
    })
    expect(items.some((item) => item.id.startsWith("checkin:"))).toBe(false)
  })

  it("skips the global switch item when no account keeps automatic check-in on", () => {
    const account = buildDisplaySiteData({
      id: "manual-account",
      name: "Manual Relay",
      checkIn: buildCheckInConfig({ automaticExecutionEnabled: false }),
    })

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        accounts: [account],
        globalAutomaticExecutionEnabled: false,
      }).map((item) => item.id),
    ).not.toContain("auto-checkin:globally-disabled")
  })

  it("adds an unread announcement item", () => {
    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        unreadAnnouncementCount: 3,
      }),
    ).toContainEqual({
      id: "announcements:unread",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.unreadSiteAnnouncements,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
      severity: "info",
      titleOptions: { total: 3 },
      target: { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
    })
  })

  it("splits skipped check-ins into reason-specific todos", () => {
    const autoCheckinStatus: AutoCheckinStatus = {
      perAccount: {
        "credentials-account": skippedResult(
          "credentials-account",
          AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
        ),
        "auth-account": skippedResult(
          "auth-account",
          AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
        ),
        "permission-account": skippedResult(
          "permission-account",
          AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED,
        ),
        "data-account": skippedResult(
          "data-account",
          AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING,
        ),
        "already-checked": skippedResult(
          "already-checked",
          AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
        ),
        "no-method": skippedResult(
          "no-method",
          AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD,
        ),
        "network-account": skippedResult(
          "network-account",
          AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
        ),
        "no-provider": skippedResult(
          "no-provider",
          AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER,
        ),
        "disabled-account": skippedResult(
          "disabled-account",
          AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
        ),
      },
    }

    const items = buildAttentionItems({
      enabledAccountCount: 4,
      profileCount: 1,
      problemAccounts: [],
      autoCheckinStatus,
      globalAutomaticExecutionEnabled: true,
    })

    expect(items).toContainEqual({
      id: "auto-checkin:relogin-required",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInReloginRequired,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
      severity: "warning",
      titleOptions: { total: 1 },
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
    })
    expect(items).toContainEqual({
      id: "auto-checkin:account-data-missing",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInAccountDataMissing,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
      severity: "warning",
      titleOptions: { total: 2 },
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
    })
    expect(items).toContainEqual({
      id: "auto-checkin:permission-denied",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.checkInPermissionDenied,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
      severity: "warning",
      titleOptions: { total: 1 },
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
    })
    expect(
      items
        .filter((item) => item.category === "automation")
        .map((item) => item.id),
    ).toEqual([
      "auto-checkin:account-data-missing",
      "auto-checkin:permission-denied",
      "auto-checkin:relogin-required",
    ])
  })

  it("flags disabled-only accounts instead of a missing-account hint", () => {
    const items = buildAttentionItems({
      enabledAccountCount: 0,
      totalAccountCount: 2,
      profileCount: 1,
      problemAccounts: [],
    })

    expect(items).toContainEqual({
      id: "accounts:all-disabled",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountsAllDisabled,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
      severity: "info",
      titleOptions: { total: 2 },
      target: { menuItemId: MENU_ITEM_IDS.ACCOUNT, params: undefined },
    })
    expect(items.map((item) => item.id)).not.toContain("setup:add-account")
  })

  it("routes temp-window health issues to the matching settings tab", () => {
    const permissionAccount = buildDisplaySiteData({
      id: "permission-account",
      name: "Permission Account",
      health: {
        status: SiteHealthStatus.Warning,
        reason: "Permission required",
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
      },
    })
    const disabledAccount = buildDisplaySiteData({
      id: "disabled-window-account",
      name: "Disabled Window Account",
      health: {
        status: SiteHealthStatus.Warning,
        reason: "Temporary window disabled",
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      },
    })

    const items = buildAttentionItems({
      enabledAccountCount: 2,
      profileCount: 1,
      problemAccounts: [permissionAccount, disabledAccount],
    })

    expect(items).toContainEqual({
      id: "account:permission-account:temp-window",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountTempWindowIssue,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
      severity: "warning",
      titleOptions: { name: "Permission Account" },
      descriptionOptions: { reason: "Permission required" },
      target: {
        menuItemId: MENU_ITEM_IDS.BASIC,
        params: {
          tab: "permissions",
          anchor: undefined,
          highlight: undefined,
        },
      },
    })
    expect(items).toContainEqual({
      id: "account:disabled-window-account:temp-window",
      kind: OPTIONS_OVERVIEW_ATTENTION_KINDS.accountTempWindowIssue,
      category: OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.accounts,
      severity: "warning",
      titleOptions: { name: "Disabled Window Account" },
      descriptionOptions: { reason: "Temporary window disabled" },
      target: {
        menuItemId: MENU_ITEM_IDS.BASIC,
        params: {
          tab: "refresh",
          anchor: "shield-settings",
          highlight: "shield-settings",
        },
      },
    })
  })
  it("ignores routine and transient skipped check-ins", () => {
    const autoCheckinStatus: AutoCheckinStatus = {
      perAccount: {
        "already-checked": skippedResult(
          "already-checked",
          AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
        ),
        "disabled-account": skippedResult(
          "disabled-account",
          AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
        ),
        "no-method": skippedResult(
          "no-method",
          AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD,
        ),
        timeout: skippedResult("timeout", AUTO_CHECKIN_SKIP_REASON.TIMEOUT),
      },
    }

    expect(
      buildAttentionItems({
        enabledAccountCount: 4,
        profileCount: 1,
        problemAccounts: [],
        autoCheckinStatus,
        globalAutomaticExecutionEnabled: true,
      }).filter(
        (item) =>
          item.category === OPTIONS_OVERVIEW_ATTENTION_CATEGORIES.automation,
      ),
    ).toEqual([])
  })

  it("ignores skipped check-ins while the global switch is off", () => {
    const autoCheckinStatus: AutoCheckinStatus = {
      perAccount: {
        "credentials-account": skippedResult(
          "credentials-account",
          AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
        ),
      },
    }

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        autoCheckinStatus,
        globalAutomaticExecutionEnabled: false,
      }).map((item) => item.id),
    ).not.toContain("auto-checkin:account-data-missing")
  })

  it("skips accounts whose check-in method is already selected", () => {
    const methodId = AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
    const account = buildDisplaySiteData({
      id: "selected-account",
      name: "Selected Relay",
      siteType: SITE_TYPES.NEW_API,
      checkIn: buildCheckInConfig({
        automaticExecutionEnabled: true,
        selection: {
          mode: CHECK_IN_SELECTION_MODES.Automatic,
          methodId,
        },
        methodKnowledge: {
          methods: {
            [methodId]: {
              detection: {
                outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
                evidence: {
                  source:
                    CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.CompatibilityRegistration,
                },
              },
            },
          },
        },
      }),
    })

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        accounts: [account],
        globalAutomaticExecutionEnabled: true,
      }).map((item) => item.id),
    ).not.toContain("checkin:selected-account:method-unresolved")
  })

  it("ignores site types without a registered check-in method", () => {
    const account = buildDisplaySiteData({
      id: "apiyi-account",
      name: "APIYI Relay",
      siteType: SITE_TYPES.APIYI,
      checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
    })

    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        accounts: [account],
        globalAutomaticExecutionEnabled: true,
      }).map((item) => item.id),
    ).not.toContain("checkin:apiyi-account:method-unresolved")
  })

  it("skips the unread announcement item without unread records", () => {
    expect(
      buildAttentionItems({
        enabledAccountCount: 1,
        profileCount: 1,
        problemAccounts: [],
        unreadAnnouncementCount: 0,
      }).map((item) => item.id),
    ).not.toContain("announcements:unread")
  })
})
