import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { WEBDAV_AUTO_SYNC_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { buildAutomationOverview } from "~/features/OptionsOverview/automation/automationOverview"
import {
  OPTIONS_OVERVIEW_AUTO_CHECKIN_ACTION_IDS as CHECKIN_ACTION_IDS,
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES as CHECKIN_STATUSES,
  OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS as ITEM_IDS,
  OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS as STATUS_LABELS,
} from "~/features/OptionsOverview/ids"
import type { OptionsOverviewAutoCheckinPanel } from "~/features/OptionsOverview/types"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import {
  ANNOUNCEMENT_SOURCE_SCOPES,
  SITE_ANNOUNCEMENT_STATUS,
  type SiteAnnouncementRecord,
  type SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"

const basePreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
}

const autoCheckinPanel: OptionsOverviewAutoCheckinPanel = {
  status: CHECKIN_STATUSES.partial,
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
      id: CHECKIN_ACTION_IDS.openAutoCheckin,
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      isVisible: true,
    },
    {
      id: CHECKIN_ACTION_IDS.retryFailed,
      target: { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN },
      isVisible: true,
    },
  ],
}

const announcementRecord = {
  id: "announcement-1",
  siteKey: "site:new-api:https://relay.example.invalid",
  siteName: "Relay",
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://relay.example.invalid",
  accountId: "account-1",
  sourceScope: ANNOUNCEMENT_SOURCE_SCOPES.Site,
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
  sourceScope: ANNOUNCEMENT_SOURCE_SCOPES.Site,
  status: SITE_ANNOUNCEMENT_STATUS.Error,
  lastCheckedAt: 1780450200000,
  records: [announcementRecord],
} satisfies SiteAnnouncementSiteState

describe("overview automation model", () => {
  it.each([
    [undefined, "unknown"],
    [null, "not_run"],
    [{ total: 0, successCount: 0, failureCount: 0 }, "skipped"],
    [{ total: 2, successCount: 0, failureCount: 2 }, "failed"],
    [{ total: 2, successCount: 2, failureCount: 0 }, "success"],
  ] as const)(
    "distinguishes missing model-sync history from unavailable data: %j",
    (stats, expected) => {
      const item = buildAutomationOverview({
        autoCheckinPanel,
        preferences: {
          ...basePreferences,
          managedSiteModelSync: {
            ...basePreferences.managedSiteModelSync!,
            enabled: true,
          },
        },
        managedSiteType: SITE_TYPES.NEW_API,
        siteAnnouncementRecords: [],
        siteAnnouncementStatuses: [],
        modelSyncExecution:
          stats === undefined || stats === null
            ? stats
            : {
                items: [],
                statistics: {
                  ...stats,
                  durationMs: 1,
                  startedAt: 1,
                  endedAt: 2,
                },
              },
      }).items.find((item) => item.id === ITEM_IDS.managedSiteModelSync)
      expect(item?.statusLabel).toBe(expected)
    },
  )

  it.each([
    ["idle", false, "not_run"],
    ["success", false, "success"],
    ["error", false, "failed"],
    ["error", true, "running"],
  ] as const)(
    "uses WebDAV result %s and running=%s",
    (lastSyncStatus, isSyncing, expected) => {
      const item = buildAutomationOverview({
        autoCheckinPanel,
        preferences: {
          ...basePreferences,
          webdav: { ...basePreferences.webdav, autoSync: true },
        },
        managedSiteType: undefined,
        siteAnnouncementRecords: [],
        siteAnnouncementStatuses: [],
        webdavStatus: {
          isRunning: true,
          isInitialized: true,
          isSyncing,
          lastSyncTime: 0,
          lastSyncStatus,
          lastSyncError: null,
        },
      }).items.find((item) => item.id === ITEM_IDS.webdavAutoSync)
      expect(item?.statusLabel).toBe(expected)
    },
  )

  it("prioritizes disabled switches over old sync failures", () => {
    const view = buildAutomationOverview({
      autoCheckinPanel,
      preferences: {
        ...basePreferences,
        managedSiteModelSync: {
          ...basePreferences.managedSiteModelSync!,
          enabled: false,
        },
        webdav: { ...basePreferences.webdav, autoSync: false },
      },
      managedSiteType: SITE_TYPES.NEW_API,
      siteAnnouncementRecords: [],
      siteAnnouncementStatuses: [],
      modelSyncExecution: {
        items: [],
        statistics: {
          total: 1,
          successCount: 0,
          failureCount: 1,
          durationMs: 1,
          startedAt: 1,
          endedAt: 2,
        },
      },
      webdavStatus: {
        isRunning: false,
        isInitialized: true,
        isSyncing: false,
        lastSyncTime: 1,
        lastSyncStatus: "error",
        lastSyncError: "offline",
      },
    })
    expect(
      view.items
        .filter((item) =>
          ["managedSiteModelSync", "webdavAutoSync"].includes(item.id),
        )
        .map((item) => [item.status, item.statusLabel]),
    ).toEqual([
      ["info", "disabled"],
      ["info", "disabled"],
    ])
  })

  it.each([
    [[], "info", "not_run"],
    [["never"], "info", "not_run"],
    [["success"], "success", "success"],
    [["error"], "error", "failed"],
    [["unsupported"], "info", "unsupported"],
    [["success", "unsupported"], "warning", "limited"],
    [["error", "unsupported"], "error", "failed"],
    [["success", "error", "unsupported"], "warning", "partial"],
  ] as const)(
    "reports announcement outcomes %j without confusing them with the switch",
    (statuses, status, statusLabel) => {
      const item = buildAutomationOverview({
        autoCheckinPanel,
        preferences: basePreferences,
        managedSiteType: undefined,
        siteAnnouncementRecords: [],
        siteAnnouncementStatuses: statuses.map((status, index) => ({
          ...announcementStatus,
          siteKey: String(index),
          status,
        })),
      }).items.find((item) => item.id === ITEM_IDS.siteAnnouncements)
      expect(item).toMatchObject({ status, statusLabel })
    },
  )

  it("uses persisted model-sync results and WebDAV runtime errors", () => {
    const view = buildAutomationOverview({
      autoCheckinPanel,
      preferences: {
        ...basePreferences,
        managedSiteModelSync: {
          ...basePreferences.managedSiteModelSync!,
          enabled: true,
        },
        webdav: { ...basePreferences.webdav, autoSync: true },
      },
      managedSiteType: SITE_TYPES.NEW_API,
      siteAnnouncementRecords: [],
      siteAnnouncementStatuses: [],
      modelSyncExecution: {
        items: [],
        statistics: {
          total: 3,
          successCount: 2,
          failureCount: 1,
          skippedCount: 1,
          durationMs: 1000,
          startedAt: 1780450200000,
          endedAt: 1780450201000,
        },
      },
      webdavStatus: {
        isRunning: true,
        isInitialized: true,
        isSyncing: false,
        lastSyncTime: 1780450200000,
        lastSyncStatus: "error",
        lastSyncError: "Connection failed",
      },
    })
    expect(
      view.items.find((item) => item.id === ITEM_IDS.managedSiteModelSync),
    ).toMatchObject({
      status: "warning",
      statusLabel: STATUS_LABELS.partial,
      summaryRows: expect.arrayContaining([
        { id: "success", value: "2" },
        { id: "failed", value: "1" },
        { id: "skipped", value: "1" },
        {
          id: "lastRun",
          value: "2026-06-03T01:30:01.000Z",
          valueType: "datetime",
        },
      ]),
    })
    expect(
      view.items.find((item) => item.id === ITEM_IDS.webdavAutoSync),
    ).toMatchObject({
      status: "error",
      statusLabel: STATUS_LABELS.failed,
    })
  })

  it("describes mixed announcement results as partial failure instead of enabled", () => {
    const item = buildAutomationOverview({
      autoCheckinPanel,
      preferences: basePreferences,
      managedSiteType: undefined,
      siteAnnouncementRecords: [],
      siteAnnouncementStatuses: [
        announcementStatus,
        {
          ...announcementStatus,
          siteKey: "healthy-site",
          status: SITE_ANNOUNCEMENT_STATUS.Success,
        },
        {
          ...announcementStatus,
          siteKey: "unsupported-site",
          status: SITE_ANNOUNCEMENT_STATUS.Unsupported,
        },
      ],
    }).items.find((item) => item.id === ITEM_IDS.siteAnnouncements)

    expect(item).toMatchObject({
      status: "warning",
      statusLabel: STATUS_LABELS.partial,
    })
    expect(item?.summaryRows).toEqual(
      expect.arrayContaining([
        { id: "success", value: "1" },
        { id: "failed", value: "1" },
        { id: "unsupported", value: "1" },
      ]),
    )
  })

  it("builds automation rows from panel state, preferences, and announcement data", () => {
    const view = buildAutomationOverview({
      autoCheckinPanel,
      preferences: {
        ...basePreferences,
        siteAnnouncementNotifications: {
          enabled: true,
          notificationEnabled: true,
          intervalMinutes: 180,
          notificationMaxAgeDays: 7,
          autoMarkUpstreamReadOnNotify: false,
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
      statusLabel: STATUS_LABELS.partial,
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
      view.items.find((item) => item.id === ITEM_IDS.siteAnnouncements),
    ).toMatchObject({
      status: "error",
      statusLabel: STATUS_LABELS.failed,
      primaryTarget: { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
      summaryRows: [
        { id: "interval", value: "180" },
        { id: "records", value: "1" },
        { id: "unread", value: "1" },
        {
          id: "lastChecked",
          value: "2026-06-03T01:30:00.000Z",
          valueType: "datetime",
        },
        { id: "success", value: "0" },
        { id: "failed", value: "1" },
        { id: "unsupported", value: "0" },
      ],
    })

    expect(
      view.items.find((item) => item.id === ITEM_IDS.managedSiteModelSync),
    ).toMatchObject({
      status: "info",
      statusLabel: STATUS_LABELS.unknown,
      primaryTarget: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
      summaryRows: [
        { id: "lastRun", value: "", valueType: "datetime" },
        { id: "success", value: "0" },
        { id: "failed", value: "0" },
        { id: "skipped", value: "0" },
        { id: "interval", value: "2" },
        { id: "concurrency", value: "4" },
        { id: "allowedModels", value: "2" },
      ],
    })

    expect(
      view.items.find((item) => item.id === ITEM_IDS.webdavAutoSync),
    ).toEqual({
      id: "webdavAutoSync",
      enabled: true,
      status: "info",
      statusLabel: STATUS_LABELS.unknown,
      primaryTarget: {
        menuItemId: MENU_ITEM_IDS.IMPORT_EXPORT,
        params: {
          anchor: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
          highlight: WEBDAV_AUTO_SYNC_TARGET_IDS.root,
        },
      },
      summaryRows: [
        { id: "lastRun", value: "", valueType: "datetime" },
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
            status: SITE_ANNOUNCEMENT_STATUS.Unsupported,
          },
        ],
      }).items.map((item) => [item.id, item.status, item.statusLabel]),
    ).toEqual([
      ["autoCheckin", "warning", "partial"],
      ["siteAnnouncements", "info", "unsupported"],
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
            notificationMaxAgeDays: 7,
            autoMarkUpstreamReadOnNotify: false,
          },
        },
        managedSiteType: undefined,
        siteAnnouncementRecords: [announcementRecord],
        siteAnnouncementStatuses: [announcementStatus],
      }).items.find((item) => item.id === ITEM_IDS.siteAnnouncements),
    ).toMatchObject({
      status: "info",
      statusLabel: STATUS_LABELS.disabled,
    })
  })
})
