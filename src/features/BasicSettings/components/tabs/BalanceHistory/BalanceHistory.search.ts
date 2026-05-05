import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const balanceHistorySearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:balance-history",
    "balanceHistory",
    "balance-history",
    "balanceHistory:title",
    280,
  ),
]

export const balanceHistorySearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:balance-history-enabled",
    "balanceHistory",
    "balance-history-enabled",
    "balanceHistory:settings.enabled",
    580,
    {
      descriptionKey: "balanceHistory:settings.enabledHint",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.balanceHistory",
        "balanceHistory:title",
      ],
      keywords: ["balance history", "history"],
    },
  ),
  buildControlDefinition(
    "control:balance-history-end-of-day-capture",
    "balanceHistory",
    "balance-history-end-of-day-capture",
    "balanceHistory:settings.endOfDayCapture",
    581,
    {
      descriptionKey: "balanceHistory:settings.endOfDayCaptureHint",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.balanceHistory",
        "balanceHistory:title",
      ],
      keywords: ["balance history", "end of day", "capture", "23:55"],
    },
  ),
  buildControlDefinition(
    "control:balance-history-retention-days",
    "balanceHistory",
    "balance-history-retention-days",
    "balanceHistory:settings.retentionDays",
    582,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.balanceHistory",
        "balanceHistory:title",
      ],
      keywords: ["balance history", "retention", "days"],
    },
  ),
  buildControlDefinition(
    "control:balance-history-apply-settings",
    "balanceHistory",
    "balance-history-apply-settings",
    "balanceHistory:actions.applySettings",
    583,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.balanceHistory",
        "balanceHistory:title",
      ],
      keywords: ["balance history", "save", "apply settings"],
    },
  ),
]
