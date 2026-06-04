import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  WEBDAV_AUTO_SYNC_TARGET_IDS,
  WEBDAV_TARGET_IDS,
} from "~/features/ImportExport/searchTargets"
import { buildConfigurationOverviewItems } from "~/features/OptionsOverview/configurationOverviewItems"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type { SiteAccount } from "~/types"

const readyCheckinAccount = {
  disabled: false,
  checkIn: {
    enableDetection: true,
  },
} as SiteAccount

const basePreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
}

describe("overview configuration model", () => {
  it("builds setup-oriented configuration groups when prerequisites are missing", () => {
    const items = buildConfigurationOverviewItems({
      enabledAccountCount: 0,
      accounts: [],
      profileCount: 0,
      preferences: basePreferences,
      managedSiteType: undefined,
      hasUsageData: false,
    })

    expect(items.map((item) => [item.id, item.status])).toEqual([
      ["accountFoundation", "needs_setup"],
      ["credentialAssets", "needs_setup"],
      ["automation", "needs_setup"],
      ["dataHistory", "needs_setup"],
      ["backupSync", "disabled"],
      ["managedSite", "not_applicable"],
    ])
    expect(items.find((item) => item.id === "managedSite")?.isVisible).toBe(
      false,
    )
    expect(
      items
        .find((item) => item.id === "automation")
        ?.subItems.map((item) => [item.id, item.status, item.target]),
    ).toEqual([
      [
        "autoCheckin",
        "needs_setup",
        { menuItemId: MENU_ITEM_IDS.ACCOUNT, params: undefined },
      ],
      [
        "siteAnnouncements",
        "disabled",
        {
          menuItemId: MENU_ITEM_IDS.BASIC,
          params: {
            tab: "general",
            anchor: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
            highlight: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
          },
        },
      ],
    ])
    expect(
      items
        .find((item) => item.id === "dataHistory")
        ?.subItems.map((item) => [item.id, item.status, item.target]),
    ).toEqual([
      [
        "usageAnalytics",
        "needs_setup",
        { menuItemId: MENU_ITEM_IDS.ACCOUNT, params: undefined },
      ],
      [
        "balanceHistory",
        "disabled",
        {
          menuItemId: MENU_ITEM_IDS.BASIC,
          params: {
            tab: "balanceHistory",
            anchor: SETTINGS_ANCHORS.BALANCE_HISTORY,
            highlight: SETTINGS_ANCHORS.BALANCE_HISTORY,
          },
        },
      ],
    ])
  })

  it("summarizes configured operational capabilities and WebDAV backup readiness", () => {
    const items = buildConfigurationOverviewItems({
      enabledAccountCount: 1,
      accounts: [readyCheckinAccount],
      profileCount: 2,
      preferences: {
        ...basePreferences,
        siteAnnouncementNotifications: {
          ...basePreferences.siteAnnouncementNotifications!,
          enabled: true,
        },
        balanceHistory: {
          ...basePreferences.balanceHistory!,
          enabled: true,
        },
        webdav: {
          ...basePreferences.webdav,
          url: "https://webdav.example.invalid/backups",
          username: "backup-user",
          password: "redacted-password",
          autoSync: true,
        },
      },
      managedSiteType: undefined,
      hasUsageData: true,
    })

    expect(items.map((item) => [item.id, item.status])).toEqual([
      ["accountFoundation", "configured"],
      ["credentialAssets", "configured"],
      ["automation", "configured"],
      ["dataHistory", "configured"],
      ["backupSync", "configured"],
      ["managedSite", "not_applicable"],
    ])
    expect(
      items
        .find((item) => item.id === "automation")
        ?.subItems.map((item) => [item.id, item.status, item.target]),
    ).toEqual([
      ["autoCheckin", "configured", { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN }],
      [
        "siteAnnouncements",
        "configured",
        { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
      ],
    ])
    expect(
      items
        .find((item) => item.id === "backupSync")
        ?.subItems.map((item) => [item.id, item.status, item.target]),
    ).toEqual([
      [
        "webdavManual",
        "configured",
        {
          menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
          params: {
            anchor: WEBDAV_TARGET_IDS.root,
            highlight: WEBDAV_TARGET_IDS.root,
          },
        },
      ],
      [
        "webdavAutoSync",
        "configured",
        {
          menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
          params: {
            anchor: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
            highlight: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
          },
        },
      ],
    ])
  })

  it("shows managed-site setup and model sync states for the selected managed site", () => {
    const missingConfigItems = buildConfigurationOverviewItems({
      enabledAccountCount: 1,
      accounts: [readyCheckinAccount],
      profileCount: 1,
      preferences: basePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
      hasUsageData: false,
    })

    expect(
      missingConfigItems.find((item) => item.id === "managedSite"),
    ).toMatchObject({
      status: "needs_setup",
      isVisible: true,
      subItems: [
        {
          id: "managedSiteChannels",
          status: "needs_setup",
          target: {
            menuItemId: MENU_ITEM_IDS.BASIC,
            params: {
              tab: "managedSite",
              anchor: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
              highlight: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
            },
          },
        },
        {
          id: "managedSiteModelSync",
          status: "needs_setup",
          target: {
            menuItemId: MENU_ITEM_IDS.BASIC,
            params: {
              tab: "managedSite",
              anchor: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
              highlight: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
            },
          },
        },
      ],
    })

    const configuredItems = buildConfigurationOverviewItems({
      enabledAccountCount: 1,
      accounts: [readyCheckinAccount],
      profileCount: 1,
      preferences: {
        ...basePreferences,
        newApi: {
          ...basePreferences.newApi,
          baseUrl: "https://managed.example.invalid",
          adminToken: "redacted-admin-token",
          userId: "1",
        },
        managedSiteModelSync: {
          ...basePreferences.managedSiteModelSync!,
          enabled: true,
        },
      },
      managedSiteType: SITE_TYPES.NEW_API,
      hasUsageData: false,
    })

    expect(
      configuredItems.find((item) => item.id === "managedSite"),
    ).toMatchObject({
      status: "configured",
      isVisible: true,
      subItems: [
        {
          id: "managedSiteChannels",
          status: "configured",
          target: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS },
        },
        {
          id: "managedSiteModelSync",
          status: "configured",
          target: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
        },
      ],
    })
  })

  it("keeps model sync not-applicable for managed sites without sync support", () => {
    const items = buildConfigurationOverviewItems({
      enabledAccountCount: 1,
      accounts: [readyCheckinAccount],
      profileCount: 1,
      preferences: {
        ...basePreferences,
        axonHub: {
          baseUrl: "https://axon.example.invalid",
          email: "admin@example.invalid",
          password: "redacted-password",
        },
        managedSiteModelSync: {
          ...basePreferences.managedSiteModelSync!,
          enabled: true,
        },
      },
      managedSiteType: SITE_TYPES.AXON_HUB,
      hasUsageData: false,
    })

    expect(
      items
        .find((item) => item.id === "managedSite")
        ?.subItems.map((item) => [item.id, item.status, item.target]),
    ).toEqual([
      [
        "managedSiteChannels",
        "configured",
        { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS },
      ],
      [
        "managedSiteModelSync",
        "not_applicable",
        {
          menuItemId: MENU_ITEM_IDS.BASIC,
          params: {
            tab: "managedSite",
            anchor: SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC,
            highlight: SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC,
          },
        },
      ],
    ])
  })
})
