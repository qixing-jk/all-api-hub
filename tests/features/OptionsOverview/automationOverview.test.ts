import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { WEBDAV_AUTO_SYNC_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { buildAutomationOverview } from "~/features/OptionsOverview/automationOverview"
import type { OptionsOverviewAutoCheckinPanel } from "~/features/OptionsOverview/types"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import {
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
  type SiteAnnouncementRecord,
  type SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"

const basePreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
}

const autoCheckinPanel: OptionsOverviewAutoCheckinPanel = {
  status: "partial",
  severity: "warning",
  totalEligible: 3,
  executed: 2,
  successCount: 1,
  failedCount: 1,
  skippedCount: 1,
  needsRetry: true,
  lastRunAt: "2026-06-03T01:00:00.000Z",
  nextRunAt: "2026-06-04T01:00:00.000Z",
  nextRetryAt: "2026-06-03T01:30:00.000Z",
  actions: [
    {
      id: "openAutoCheckin",
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      isVisible: true,
    },
    {
      id: "retryFailed",
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      isVisible: true,
    },
  ],
}

const announcementRecord = {
  id: "announcement-1",
  siteKey: "notice:new-api:https://relay.example.invalid",
  siteName: "Relay",
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://relay.example.invalid",
  accountId: "account-1",
  providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
  title: "Announcement",
  content: "Summary",
  fingerprint: "announcement-fingerprint",
  firstSeenAt: 1780450200000,
  lastSeenAt: 1780450200000,
  read: false,
} satisfies SiteAnnouncementRecord

const announcementStatus = {
  siteKey: announcementRecord.siteKey,
  siteName: announcementRecord.siteName,
  siteType: SITE_TYPES.NEW_API,
  baseUrl: announcementRecord.baseUrl,
  accountId: announcementRecord.accountId,
  providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
  status: "error",
  lastCheckedAt: 1780450200000,
  records: [announcementRecord],
} satisfies SiteAnnouncementSiteState

describe("overview automation model", () => {
  it("builds automation rows from panel state, preferences, and announcement data", () => {
    const view = buildAutomationOverview({
      autoCheckinPanel,
      preferences: {
        ...basePreferences,
        siteAnnouncementNotifications: {
          enabled: true,
          notificationEnabled: true,
          intervalMinutes: 180,
        },
        managedSiteModelSync: {
          ...basePreferences.managedSiteModelSync!,
          enabled: true,
          interval: 2 * 60 * 60 * 1000,
          concurrency: 4,
          allowedModels: ["gpt-4o", "gpt-4.1"],
        },
        webdav: {
          ...basePreferences.webdav,
          autoSync: true,
          syncInterval: 900,
          syncStrategy: "upload_only",
          syncData: {
            accounts: true,
            bookmarks: false,
            apiCredentialProfiles: true,
            preferences: false,
          },
        },
      },
      managedSiteType: SITE_TYPES.NEW_API,
      siteAnnouncementRecords: [announcementRecord],
      siteAnnouncementStatuses: [announcementStatus],
    })

    expect(view.items.map((item) => item.id)).toEqual([
      "autoCheckin",
      "siteAnnouncements",
      "managedSiteModelSync",
      "webdavAutoSync",
    ])
    expect(view.items[0]).toMatchObject({
      id: "autoCheckin",
      status: "warning",
      statusLabel: "enabled",
      primaryTarget: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      defaultExpanded: false,
      autoCheckinPanel,
    })
    expect(view.items[0]?.summaryRows).toEqual([
      {
        id: "lastRun",
        value: "2026-06-03T01:00:00.000Z",
        valueType: "datetime",
      },
      {
        id: "nextRun",
        value: "2026-06-04T01:00:00.000Z",
        valueType: "datetime",
      },
      {
        id: "nextRetry",
        value: "2026-06-03T01:30:00.000Z",
        valueType: "datetime",
      },
    ])
    expect(view.items[0]?.actions.map((action) => action.variant)).toEqual([
      "default",
      "outline",
    ])

    expect(
      view.items.find((item) => item.id === "siteAnnouncements"),
    ).toMatchObject({
      status: "error",
      statusLabel: "enabled",
      primaryTarget: {
        menuItemId: MENU_ITEM_IDS.BASIC,
        params: {
          tab: "general",
          anchor: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
          highlight: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
        },
      },
      summaryRows: [
        { id: "interval", value: "180" },
        { id: "records", value: "1" },
        { id: "unread", value: "1" },
        {
          id: "lastChecked",
          value: "2026-06-03T01:30:00.000Z",
          valueType: "datetime",
        },
      ],
    })

    expect(
      view.items.find((item) => item.id === "managedSiteModelSync"),
    ).toMatchObject({
      status: "success",
      statusLabel: "enabled",
      primaryTarget: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
      summaryRows: [
        { id: "interval", value: "2" },
        { id: "concurrency", value: "4" },
        { id: "allowedModels", value: "2" },
      ],
    })

    expect(view.items.find((item) => item.id === "webdavAutoSync")).toEqual({
      id: "webdavAutoSync",
      status: "success",
      statusLabel: "enabled",
      primaryTarget: {
        menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
        params: {
          anchor: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
          highlight: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
        },
      },
      summaryRows: [
        { id: "interval", value: "15" },
        { id: "strategy", value: "upload_only" },
        { id: "domains", value: "2" },
      ],
      actions: [
        {
          id: "openImportExport",
          target: {
            menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
            params: {
              anchor: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
              highlight: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
            },
          },
        },
      ],
      defaultExpanded: false,
    })
  })

  it("omits managed-site model sync for managed sites without sync support", () => {
    expect(
      buildAutomationOverview({
        autoCheckinPanel,
        preferences: basePreferences,
        managedSiteType: SITE_TYPES.AXON_HUB,
        siteAnnouncementRecords: [],
        siteAnnouncementStatuses: [
          {
            ...announcementStatus,
            status: "unsupported",
          },
        ],
      }).items.map((item) => [item.id, item.status, item.statusLabel]),
    ).toEqual([
      ["autoCheckin", "warning", "enabled"],
      ["siteAnnouncements", "info", "disabled"],
      ["webdavAutoSync", "info", "disabled"],
    ])
  })

  it("keeps disabled announcement polling informational despite stale site statuses", () => {
    expect(
      buildAutomationOverview({
        autoCheckinPanel,
        preferences: {
          ...basePreferences,
          siteAnnouncementNotifications: {
            enabled: false,
            notificationEnabled: false,
            intervalMinutes: 180,
          },
        },
        managedSiteType: undefined,
        siteAnnouncementRecords: [announcementRecord],
        siteAnnouncementStatuses: [announcementStatus],
      }).items.find((item) => item.id === "siteAnnouncements"),
    ).toMatchObject({
      status: "info",
      statusLabel: "disabled",
    })
  })
})
