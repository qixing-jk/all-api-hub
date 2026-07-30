import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"
import { SHIELD_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/Refresh/searchTargets"
import { PROTECTION_BYPASS_AUTOMATIC_FEATURES } from "~/services/protectionBypass/contracts"

const shieldBreadcrumbs = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.refresh",
  "settings:refresh.shieldTitle",
]

const automaticFeatureSearch = [
  [
    PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
    "accountRefresh",
    "Account refresh",
  ],
  [
    PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory,
    "balanceHistory",
    "Balance history",
  ],
  [PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin, "checkin", "Check-in"],
  [
    PROTECTION_BYPASS_AUTOMATIC_FEATURES.RedemptionAssist,
    "redemptionAssist",
    "Redemption assistance",
  ],
  [
    PROTECTION_BYPASS_AUTOMATIC_FEATURES.LdohSiteLookup,
    "ldohSiteLookup",
    "Site lookup",
  ],
  [
    PROTECTION_BYPASS_AUTOMATIC_FEATURES.KeyManagement,
    "keyManagement",
    "Key management",
  ],
  [
    PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteChannels,
    "managedSiteChannels",
    "Managed-site channels",
  ],
  [
    PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteModelSync,
    "managedSiteModelSync",
    "Managed-site model sync",
  ],
] as const

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
  ...automaticFeatureSearch.map(([feature, key, keyword], index) =>
    buildControlDefinition(
      `control:shield-automatic-feature-${feature}`,
      "refresh",
      SHIELD_SETTINGS_TARGET_IDS.feature[feature],
      `settings:refresh.shieldAutomaticFeature${key[0].toUpperCase()}${key.slice(1)}`,
      547 + index,
      {
        breadcrumbsKeys: shieldBreadcrumbs,
        keywords: ["shield", "automatic", keyword],
      },
    ),
  ),
]
