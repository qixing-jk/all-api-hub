import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const usageHistorySyncSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:usage-history-sync",
    "accountUsage",
    "usage-history-sync",
    "usageAnalytics:syncTab.settingsTitle",
    300,
  ),
  buildSectionDefinition(
    "section:usage-history-sync-state",
    "accountUsage",
    "usage-history-sync-state",
    "usageAnalytics:syncTab.stateTitle",
    301,
  ),
]

export const usageHistorySyncSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:usage-history-sync-enabled",
    "accountUsage",
    "usage-history-sync-enabled",
    "usageAnalytics:settings.enabled",
    600,
    {
      descriptionKey: "usageAnalytics:settings.enabledHint",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountUsage",
        "usageAnalytics:syncTab.settingsTitle",
      ],
      keywords: ["usage", "sync", "history"],
    },
  ),
  buildControlDefinition(
    "control:usage-history-sync-schedule-mode",
    "accountUsage",
    "usage-history-sync-schedule-mode",
    "usageAnalytics:settings.scheduleMode",
    601,
    {
      descriptionKey: "usageAnalytics:settings.scheduleModePlaceholder",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountUsage",
        "usageAnalytics:syncTab.settingsTitle",
      ],
      keywords: ["usage", "sync", "alarm", "after refresh", "manual"],
    },
  ),
  buildControlDefinition(
    "control:usage-history-sync-retention-days",
    "accountUsage",
    "usage-history-sync-retention-days",
    "usageAnalytics:settings.retentionDays",
    602,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountUsage",
        "usageAnalytics:syncTab.settingsTitle",
      ],
      keywords: ["usage", "sync", "retention", "days"],
    },
  ),
  buildControlDefinition(
    "control:usage-history-sync-interval-hours",
    "accountUsage",
    "usage-history-sync-interval-hours",
    "usageAnalytics:settings.syncIntervalHours",
    603,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountUsage",
        "usageAnalytics:syncTab.settingsTitle",
      ],
      keywords: ["usage", "sync", "interval", "hours"],
    },
  ),
  buildControlDefinition(
    "control:usage-history-sync-apply-settings",
    "accountUsage",
    "usage-history-sync-apply-settings",
    "usageAnalytics:actions.applySettings",
    604,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountUsage",
        "usageAnalytics:syncTab.settingsTitle",
      ],
      keywords: ["usage", "sync", "apply", "save"],
    },
  ),
  buildControlDefinition(
    "control:usage-history-sync-now",
    "accountUsage",
    "usage-history-sync-sync-now",
    "usageAnalytics:actions.syncNow",
    605,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountUsage",
        "usageAnalytics:syncTab.settingsTitle",
      ],
      keywords: ["usage", "sync now", "manual sync"],
    },
  ),
  buildControlDefinition(
    "control:usage-history-refresh-status",
    "accountUsage",
    "usage-history-sync-refresh-status",
    "usageAnalytics:syncTab.actions.refreshStatus",
    606,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.accountUsage",
        "usageAnalytics:syncTab.settingsTitle",
      ],
      keywords: ["usage", "refresh status", "sync status"],
    },
  ),
]
