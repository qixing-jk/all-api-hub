import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  resolveAutoCheckinConfigurationStatus,
  resolveBalanceHistoryConfigurationStatus,
  resolveManagedSiteConfigurationStatus,
  resolveSiteAnnouncementsConfigurationStatus,
  resolveUsageAnalyticsConfigurationStatus,
  summarizeConfigurationStatuses,
} from "~/features/OptionsOverview/configurationStatus"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import type { SiteAccount } from "~/types"

const readyCheckinAccount = {
  disabled: false,
  checkIn: {
    enableDetection: true,
  },
} as SiteAccount

const disabledCheckinAccount = {
  disabled: true,
  checkIn: {
    enableDetection: true,
  },
} as SiteAccount

describe("configuration status helpers", () => {
  it("promotes child statuses by configured, setup, disabled, then not-applicable priority", () => {
    expect(
      summarizeConfigurationStatuses(["disabled", "configured", "needs_setup"]),
    ).toBe("configured")
    expect(summarizeConfigurationStatuses(["disabled", "needs_setup"])).toBe(
      "needs_setup",
    )
    expect(summarizeConfigurationStatuses(["not_applicable", "disabled"])).toBe(
      "disabled",
    )
    expect(summarizeConfigurationStatuses(["not_applicable"])).toBe(
      "not_applicable",
    )
  })

  it("resolves auto check-in readiness from global enablement and account detection", () => {
    expect(
      resolveAutoCheckinConfigurationStatus({
        accounts: [readyCheckinAccount],
        preferences: DEFAULT_PREFERENCES,
      }),
    ).toBe("configured")
    expect(
      resolveAutoCheckinConfigurationStatus({
        accounts: [disabledCheckinAccount],
        preferences: DEFAULT_PREFERENCES,
      }),
    ).toBe("needs_setup")
    expect(
      resolveAutoCheckinConfigurationStatus({
        accounts: [readyCheckinAccount],
        preferences: {
          ...DEFAULT_PREFERENCES,
          autoCheckin: {
            ...DEFAULT_PREFERENCES.autoCheckin,
            globalEnabled: false,
          },
        },
      }),
    ).toBe("disabled")
  })

  it("resolves announcement polling readiness from enablement and account scope", () => {
    expect(
      resolveSiteAnnouncementsConfigurationStatus({
        enabledAccountCount: 1,
        preferences: {
          ...DEFAULT_PREFERENCES,
          siteAnnouncementNotifications: {
            ...DEFAULT_PREFERENCES.siteAnnouncementNotifications!,
            enabled: true,
          },
        },
      }),
    ).toBe("configured")
    expect(
      resolveSiteAnnouncementsConfigurationStatus({
        enabledAccountCount: 0,
        preferences: {
          ...DEFAULT_PREFERENCES,
          siteAnnouncementNotifications: {
            ...DEFAULT_PREFERENCES.siteAnnouncementNotifications!,
            enabled: true,
          },
        },
      }),
    ).toBe("needs_setup")
    expect(
      resolveSiteAnnouncementsConfigurationStatus({
        enabledAccountCount: 1,
        preferences: DEFAULT_PREFERENCES,
      }),
    ).toBe("disabled")
  })

  it("resolves usage analytics and balance history readiness independently", () => {
    expect(
      resolveUsageAnalyticsConfigurationStatus({
        hasUsageData: true,
        preferences: DEFAULT_PREFERENCES,
      }),
    ).toBe("configured")
    expect(
      resolveUsageAnalyticsConfigurationStatus({
        hasUsageData: false,
        preferences: DEFAULT_PREFERENCES,
      }),
    ).toBe("needs_setup")
    expect(
      resolveUsageAnalyticsConfigurationStatus({
        hasUsageData: true,
        preferences: {
          ...DEFAULT_PREFERENCES,
          usageHistory: {
            ...DEFAULT_PREFERENCES.usageHistory!,
            enabled: false,
          },
        },
      }),
    ).toBe("disabled")

    expect(
      resolveBalanceHistoryConfigurationStatus({
        enabledAccountCount: 1,
        preferences: {
          ...DEFAULT_PREFERENCES,
          balanceHistory: {
            ...DEFAULT_PREFERENCES.balanceHistory!,
            enabled: true,
          },
        },
      }),
    ).toBe("configured")
    expect(
      resolveBalanceHistoryConfigurationStatus({
        enabledAccountCount: 0,
        preferences: {
          ...DEFAULT_PREFERENCES,
          balanceHistory: {
            ...DEFAULT_PREFERENCES.balanceHistory!,
            enabled: true,
          },
        },
      }),
    ).toBe("needs_setup")
    expect(
      resolveBalanceHistoryConfigurationStatus({
        enabledAccountCount: 1,
        preferences: DEFAULT_PREFERENCES,
      }),
    ).toBe("disabled")
  })

  it("resolves managed-site connection and model sync readiness together", () => {
    expect(
      resolveManagedSiteConfigurationStatus({
        managedSiteType: SITE_TYPES.NEW_API,
        preferences: DEFAULT_PREFERENCES,
      }),
    ).toEqual({
      managedSiteConfigured: false,
      modelSyncStatus: "needs_setup",
    })

    expect(
      resolveManagedSiteConfigurationStatus({
        managedSiteType: SITE_TYPES.NEW_API,
        preferences: {
          ...DEFAULT_PREFERENCES,
          newApi: {
            ...DEFAULT_PREFERENCES.newApi,
            baseUrl: "https://managed.example.invalid",
            adminToken: "redacted-admin-token",
            userId: "1",
          },
        },
      }),
    ).toEqual({
      managedSiteConfigured: true,
      modelSyncStatus: "disabled",
    })

    expect(
      resolveManagedSiteConfigurationStatus({
        managedSiteType: SITE_TYPES.NEW_API,
        preferences: {
          ...DEFAULT_PREFERENCES,
          newApi: {
            ...DEFAULT_PREFERENCES.newApi,
            baseUrl: "https://managed.example.invalid",
            adminToken: "redacted-admin-token",
            userId: "1",
          },
          managedSiteModelSync: {
            ...DEFAULT_PREFERENCES.managedSiteModelSync!,
            enabled: true,
          },
        },
      }),
    ).toEqual({
      managedSiteConfigured: true,
      modelSyncStatus: "configured",
    })

    expect(
      resolveManagedSiteConfigurationStatus({
        managedSiteType: SITE_TYPES.AXON_HUB,
        preferences: {
          ...DEFAULT_PREFERENCES,
          axonHub: {
            baseUrl: "https://axon.example.invalid",
            email: "admin@example.invalid",
            password: "redacted-password",
          },
          managedSiteModelSync: {
            ...DEFAULT_PREFERENCES.managedSiteModelSync!,
            enabled: true,
          },
        },
      }),
    ).toEqual({
      managedSiteConfigured: true,
      modelSyncStatus: "not_applicable",
    })
  })
})
