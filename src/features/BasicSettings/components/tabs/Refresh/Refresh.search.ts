import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"
import { SHIELD_AUTOMATIC_FEATURE_ITEMS } from "~/features/BasicSettings/components/tabs/Refresh/automaticFeatureSettings"
import { SHIELD_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/Refresh/searchTargets"

const shieldBreadcrumbs = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.refresh",
  "settings:refresh.shieldTitle",
]

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
    SHIELD_SETTINGS_TARGET_IDS.root,
    "settings:refresh.shieldTitle",
    241,
    { keywords: ["shield", "firewall", "cloudflare"] },
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
    SHIELD_SETTINGS_TARGET_IDS.enabled,
    "settings:refresh.shieldEnabled",
    544,
    {
      descriptionKey: "settings:refresh.shieldEnabledDescTempWindowOnly",
      breadcrumbsKeys: shieldBreadcrumbs,
      keywords: [
        "site verification",
        "cloudflare",
        "temporary page",
        "automatic",
      ],
    },
  ),
  buildControlDefinition(
    "control:shield-method",
    "refresh",
    SHIELD_SETTINGS_TARGET_IDS.method,
    "settings:refresh.shieldMethodTitle",
    545,
    {
      descriptionKey: "settings:refresh.shieldMethodDesc",
      breadcrumbsKeys: shieldBreadcrumbs,
      keywords: [
        "site verification",
        "shared window",
        "background tab",
        "new window",
      ],
    },
  ),
  buildControlDefinition(
    "control:shield-automatic-features",
    "refresh",
    SHIELD_SETTINGS_TARGET_IDS.automaticFeatures,
    "settings:refresh.shieldAutomaticFeaturesTitle",
    546,
    {
      descriptionKey: "settings:refresh.shieldAutomaticFeaturesDesc",
      breadcrumbsKeys: shieldBreadcrumbs,
      keywords: ["automatic", "temporary page"],
    },
  ),
  ...SHIELD_AUTOMATIC_FEATURE_ITEMS.map(
    ({ feature, titleKey, keyword }, index) =>
      buildControlDefinition(
        `control:shield-automatic-feature-${feature}`,
        "refresh",
        SHIELD_SETTINGS_TARGET_IDS.feature[feature],
        titleKey,
        547 + index,
        {
          breadcrumbsKeys: shieldBreadcrumbs,
          keywords: ["shield", "automatic", keyword],
        },
      ),
  ),
]
