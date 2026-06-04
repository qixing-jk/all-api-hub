import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  formatSummaryValue,
  getAutomationActionLabel,
  getAutomationDisabledDescription,
  getAutomationItemLabel,
  getAutomationStatusLabel,
  getAutomationSummaryRowLabel,
} from "~/features/OptionsOverview/components/automationPanelText"
import { OPTIONS_OVERVIEW_AUTOMATION_SUMMARY_VALUE_TYPES as SUMMARY_VALUE_TYPES } from "~/features/OptionsOverview/ids"
import type { OptionsOverviewAutomationItem } from "~/features/OptionsOverview/types"

const t = ((key: string) => key) as TFunction

const baseAutomationItem: OptionsOverviewAutomationItem = {
  id: "siteAnnouncements",
  status: "success",
  statusLabel: "enabled",
  primaryTarget: { menuItemId: "account" },
  summaryRows: [],
  actions: [],
  defaultExpanded: false,
}

describe("automation panel text helpers", () => {
  it("resolves automation item labels and disabled descriptions from item ids", () => {
    expect(getAutomationItemLabel("autoCheckin", t)).toBe(
      "optionsOverview:automation.items.autoCheckin.label",
    )
    expect(getAutomationItemLabel("siteAnnouncements", t)).toBe(
      "optionsOverview:automation.items.siteAnnouncements.label",
    )
    expect(getAutomationItemLabel("managedSiteModelSync", t)).toBe(
      "optionsOverview:automation.items.managedSiteModelSync.label",
    )
    expect(getAutomationItemLabel("webdavAutoSync", t)).toBe(
      "optionsOverview:automation.items.webdavAutoSync.label",
    )

    expect(getAutomationDisabledDescription("autoCheckin", t)).toBe(
      "optionsOverview:automation.empty.autoCheckin.disabled",
    )
    expect(getAutomationDisabledDescription("siteAnnouncements", t)).toBe(
      "optionsOverview:automation.empty.siteAnnouncements.disabled",
    )
    expect(getAutomationDisabledDescription("managedSiteModelSync", t)).toBe(
      "optionsOverview:automation.empty.managedSiteModelSync.disabled",
    )
    expect(getAutomationDisabledDescription("webdavAutoSync", t)).toBe(
      "optionsOverview:automation.empty.webdavAutoSync.disabled",
    )
  })

  it("resolves summary row labels within each automation item", () => {
    expect(getAutomationSummaryRowLabel("autoCheckin", "lastRun", t)).toBe(
      "optionsOverview:autoCheckin.lastRun",
    )
    expect(getAutomationSummaryRowLabel("autoCheckin", "nextRun", t)).toBe(
      "optionsOverview:autoCheckin.nextRun",
    )
    expect(getAutomationSummaryRowLabel("autoCheckin", "nextRetry", t)).toBe(
      "optionsOverview:autoCheckin.nextRetry",
    )
    expect(
      getAutomationSummaryRowLabel("siteAnnouncements", "lastChecked", t),
    ).toBe("optionsOverview:automation.items.siteAnnouncements.lastChecked")
    expect(
      getAutomationSummaryRowLabel("siteAnnouncements", "interval", t),
    ).toBe("optionsOverview:automation.items.siteAnnouncements.interval")
    expect(
      getAutomationSummaryRowLabel("managedSiteModelSync", "allowedModels", t),
    ).toBe(
      "optionsOverview:automation.items.managedSiteModelSync.allowedModels",
    )
    expect(
      getAutomationSummaryRowLabel("managedSiteModelSync", "interval", t),
    ).toBe("optionsOverview:automation.items.managedSiteModelSync.interval")
    expect(
      getAutomationSummaryRowLabel("managedSiteModelSync", "concurrency", t),
    ).toBe("optionsOverview:automation.items.managedSiteModelSync.concurrency")
    expect(getAutomationSummaryRowLabel("webdavAutoSync", "domains", t)).toBe(
      "optionsOverview:automation.items.webdavAutoSync.domains",
    )
  })

  it("falls back to row ids for summary labels not owned by an item", () => {
    expect(getAutomationSummaryRowLabel("autoCheckin", "domains", t)).toBe(
      "domains",
    )
  })

  it("resolves status labels including auto check-in panel status overrides", () => {
    expect(getAutomationStatusLabel(baseAutomationItem, t)).toBe(
      "optionsOverview:automation.status.enabled",
    )
    expect(
      getAutomationStatusLabel(
        { ...baseAutomationItem, statusLabel: "disabled" },
        t,
      ),
    ).toBe("optionsOverview:coverageStatus.disabled")
    expect(
      getAutomationStatusLabel(
        {
          ...baseAutomationItem,
          id: "autoCheckin",
          autoCheckinPanel: {
            status: "partial",
            severity: "warning",
            totalEligible: 3,
            executed: 3,
            successCount: 2,
            failedCount: 1,
            skippedCount: 0,
            needsRetry: true,
            actions: [],
          },
        },
        t,
      ),
    ).toBe("optionsOverview:autoCheckin.status.partial")
  })

  it("formats summary values and empty fallbacks", () => {
    expect(
      formatSummaryValue("autoCheckin", { id: "lastRun", value: "" }, t),
    ).toBe("optionsOverview:autoCheckin.notRunYet")
    expect(
      formatSummaryValue("autoCheckin", { id: "nextRun", value: "" }, t),
    ).toBe("optionsOverview:autoCheckin.notScheduled")
    expect(
      formatSummaryValue("autoCheckin", { id: "nextRetry", value: "" }, t),
    ).toBe("optionsOverview:autoCheckin.notScheduled")
    expect(
      formatSummaryValue(
        "autoCheckin",
        {
          id: "lastRun",
          value: "2026-06-04T00:00:00.000Z",
          valueType: SUMMARY_VALUE_TYPES.datetime,
        },
        t,
      ),
    ).toBe(new Date("2026-06-04T00:00:00.000Z").toLocaleString())
    expect(
      formatSummaryValue(
        "siteAnnouncements",
        { id: "lastChecked", value: "" },
        t,
      ),
    ).toBe("optionsOverview:automation.neverChecked")
    expect(
      formatSummaryValue("webdavAutoSync", { id: "domains", value: "" }, t),
    ).toBe("-")
    expect(
      formatSummaryValue(
        "webdavAutoSync",
        {
          id: "interval",
          value: "30",
          valueType: SUMMARY_VALUE_TYPES.text,
        },
        t,
      ),
    ).toBe("30")
  })

  it("resolves action labels and falls back to unknown item/action pairs", () => {
    expect(getAutomationActionLabel("autoCheckin", "openAutoCheckin", t)).toBe(
      "optionsOverview:autoCheckin.actions.open",
    )
    expect(getAutomationActionLabel("autoCheckin", "retryFailed", t)).toBe(
      "optionsOverview:autoCheckin.actions.retryFailed",
    )
    expect(
      getAutomationActionLabel("siteAnnouncements", "openAnnouncements", t),
    ).toBe("optionsOverview:automation.items.siteAnnouncements.openPage")
    expect(
      getAutomationActionLabel(
        "siteAnnouncements",
        "openAnnouncementSettings",
        t,
      ),
    ).toBe("optionsOverview:automation.items.siteAnnouncements.openSettings")
    expect(
      getAutomationActionLabel(
        "managedSiteModelSync",
        "openManagedSiteModelSync",
        t,
      ),
    ).toBe("optionsOverview:automation.items.managedSiteModelSync.open")
    expect(
      getAutomationActionLabel("webdavAutoSync", "openImportExport", t),
    ).toBe("optionsOverview:automation.items.webdavAutoSync.open")
    expect(getAutomationActionLabel("autoCheckin", "openImportExport", t)).toBe(
      "openImportExport",
    )
  })
})
