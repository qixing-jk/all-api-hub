import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const refreshSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:auto-refresh",
    "refresh",
    "auto-refresh",
    "settings:refresh.title",
    240,
  ),
  buildSectionDefinition(
    "section:shield-settings",
    "refresh",
    "shield-settings",
    "settings:refresh.shieldTitle",
    241,
    {
      keywords: ["shield", "firewall", "cloudflare"],
    },
  ),
]

export const refreshSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:auto-refresh-enabled",
    "refresh",
    "refresh-auto-refresh-enabled",
    "settings:refresh.autoRefresh",
    540,
    {
      descriptionKey: "settings:refresh.autoRefreshDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.title",
      ],
      keywords: ["refresh", "interval"],
    },
  ),
  buildControlDefinition(
    "control:auto-refresh-interval",
    "refresh",
    "refresh-interval",
    "settings:refresh.refreshInterval",
    541,
    {
      descriptionKey: "settings:refresh.refreshIntervalDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.title",
      ],
      keywords: ["refresh", "seconds", "interval"],
    },
  ),
  buildControlDefinition(
    "control:refresh-on-open",
    "refresh",
    "refresh-on-open",
    "settings:refresh.refreshOnOpen",
    542,
    {
      descriptionKey: "settings:refresh.refreshOnOpenDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.title",
      ],
      keywords: ["open", "popup", "refresh"],
    },
  ),
  buildControlDefinition(
    "control:min-refresh-interval",
    "refresh",
    "min-refresh-interval",
    "settings:refresh.minRefreshInterval",
    543,
    {
      descriptionKey: "settings:refresh.minRefreshIntervalDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.title",
      ],
      keywords: ["refresh", "min interval", "seconds"],
    },
  ),
  buildControlDefinition(
    "control:shield-enabled",
    "refresh",
    "shield-enabled",
    "settings:refresh.shieldEnabled",
    544,
    {
      descriptionKey: "settings:refresh.shieldEnabledDescTempWindowOnly",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.shieldTitle",
      ],
      keywords: ["shield", "firewall", "cloudflare", "temp window"],
    },
  ),
  buildControlDefinition(
    "control:shield-method",
    "refresh",
    "shield-method",
    "settings:refresh.shieldMethodTitle",
    545,
    {
      descriptionKey: "settings:refresh.shieldMethodDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.shieldTitle",
      ],
      keywords: ["shield", "window", "tab", "composite"],
    },
  ),
  buildControlDefinition(
    "control:shield-contexts",
    "refresh",
    "shield-contexts",
    "settings:refresh.shieldContextsTitle",
    546,
    {
      descriptionKey: "settings:refresh.shieldContextsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.shieldTitle",
      ],
      keywords: ["shield", "contexts", "popup", "sidepanel", "options"],
    },
  ),
  buildControlDefinition(
    "control:shield-popup",
    "refresh",
    "shield-popup",
    "settings:refresh.shieldPopup",
    547,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.shieldTitle",
      ],
      keywords: ["shield", "popup"],
    },
  ),
  buildControlDefinition(
    "control:shield-sidepanel",
    "refresh",
    "shield-sidepanel",
    "settings:refresh.shieldSidepanel",
    548,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.shieldTitle",
      ],
      keywords: ["shield", "sidepanel", "sidebar"],
    },
  ),
  buildControlDefinition(
    "control:shield-options",
    "refresh",
    "shield-options",
    "settings:refresh.shieldOptions",
    549,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.shieldTitle",
      ],
      keywords: ["shield", "options"],
    },
  ),
  buildControlDefinition(
    "control:shield-auto-refresh",
    "refresh",
    "shield-auto-refresh",
    "settings:refresh.shieldAutoRefresh",
    550,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.shieldTitle",
      ],
      keywords: ["shield", "auto refresh"],
    },
  ),
  buildControlDefinition(
    "control:shield-manual-refresh",
    "refresh",
    "shield-manual-refresh",
    "settings:refresh.shieldManualRefresh",
    551,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.refresh",
        "settings:refresh.shieldTitle",
      ],
      keywords: ["shield", "manual refresh"],
    },
  ),
]
