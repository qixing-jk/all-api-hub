import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

const isStandardManagedSite = (managedSiteType: ManagedSiteType) =>
  managedSiteType !== SITE_TYPES.AXON_HUB &&
  managedSiteType !== SITE_TYPES.CLAUDE_CODE_HUB

const isStandardManagedSiteContext = (context: {
  managedSiteType: ManagedSiteType
}) => isStandardManagedSite(context.managedSiteType)

const isStandardManagedSiteWithModelRedirect = (context: {
  managedSiteType: ManagedSiteType
  modelRedirectEnabled: boolean
}) =>
  isStandardManagedSite(context.managedSiteType) && context.modelRedirectEnabled

const SHARED_MODEL_SYNC_KEYWORDS = [
  "model sync",
  "managed site",
  "new-api",
  "done-hub",
  "donehub",
  "veloera",
  "octopus",
]

export const managedSiteCoreSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:managed-site-selector",
    "managedSite",
    "managed-site-selector",
    "settings:managedSite.title",
    340,
  ),
  buildSectionDefinition(
    "section:managed-site-model-sync",
    "managedSite",
    "managed-site-model-sync",
    "managedSiteModelSync:settings.title",
    347,
    {
      keywords: SHARED_MODEL_SYNC_KEYWORDS,
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildSectionDefinition(
    "section:managed-site-model-redirect",
    "managedSite",
    "managed-site-model-redirect",
    "modelRedirect:title",
    348,
    {
      isVisible: isStandardManagedSiteContext,
    },
  ),
]

export const managedSiteCoreSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:managed-site-type",
    "managedSite",
    "managed-site-type",
    "settings:managedSite.siteTypeLabel",
    640,
    {
      descriptionKey: "settings:managedSite.siteTypeDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:managedSite.title",
      ],
      keywords: [
        "managed site",
        "new-api",
        "done-hub",
        "veloera",
        "octopus",
        "axonhub",
        "claude-code-hub",
        "v-api",
        "voapi",
        "super-api",
        "rix-api",
        "neo-api",
        "one-api compatible",
        "new api compatible",
      ],
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-enable",
    "managedSite",
    "managed-site-model-sync-enable",
    "managedSiteModelSync:settings.enable",
    649,
    {
      descriptionKey: "managedSiteModelSync:settings.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [...SHARED_MODEL_SYNC_KEYWORDS, "sync"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-interval",
    "managedSite",
    "managed-site-model-sync-interval",
    "managedSiteModelSync:settings.interval",
    650,
    {
      descriptionKey: "managedSiteModelSync:settings.intervalDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [...SHARED_MODEL_SYNC_KEYWORDS, "interval", "schedule"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-concurrency",
    "managedSite",
    "managed-site-model-sync-concurrency",
    "managedSiteModelSync:settings.concurrency",
    651,
    {
      descriptionKey: "managedSiteModelSync:settings.concurrencyDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [...SHARED_MODEL_SYNC_KEYWORDS, "concurrency"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-max-retries",
    "managedSite",
    "managed-site-model-sync-max-retries",
    "managedSiteModelSync:settings.maxRetries",
    652,
    {
      descriptionKey: "managedSiteModelSync:settings.maxRetriesDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [...SHARED_MODEL_SYNC_KEYWORDS, "retries"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-channel-processing-timeout",
    "managedSite",
    "managed-site-model-sync-channel-processing-timeout",
    "managedSiteModelSync:settings.channelProcessingTimeout",
    653,
    {
      descriptionKey:
        "managedSiteModelSync:settings.channelProcessingTimeoutDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [
        ...SHARED_MODEL_SYNC_KEYWORDS,
        "timeout",
        "duration",
        "per channel",
        "skip",
      ],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-requests-per-minute",
    "managedSite",
    "managed-site-model-sync-requests-per-minute",
    "managedSiteModelSync:settings.requestsPerMinute",
    654,
    {
      descriptionKey: "managedSiteModelSync:settings.requestsPerMinuteDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [...SHARED_MODEL_SYNC_KEYWORDS, "rate limit", "rpm"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-burst",
    "managedSite",
    "managed-site-model-sync-burst",
    "managedSiteModelSync:settings.burst",
    655,
    {
      descriptionKey: "managedSiteModelSync:settings.burstDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [...SHARED_MODEL_SYNC_KEYWORDS, "rate limit", "burst"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-allowed-models",
    "managedSite",
    "managed-site-model-sync-allowed-models",
    "managedSiteModelSync:settings.allowedModels",
    656,
    {
      descriptionKey: "managedSiteModelSync:settings.allowedModelsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [...SHARED_MODEL_SYNC_KEYWORDS, "allowed models"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-global-channel-model-filters",
    "managedSite",
    "managed-site-model-sync-global-channel-model-filters",
    "managedSiteModelSync:settings.globalChannelModelFilters",
    657,
    {
      descriptionKey:
        "managedSiteModelSync:settings.globalChannelModelFiltersDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [...SHARED_MODEL_SYNC_KEYWORDS, "filters", "channel filters"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-sync-view-execution",
    "managedSite",
    "managed-site-model-sync-view-execution",
    "managedSiteModelSync:settings.viewExecution",
    658,
    {
      descriptionKey: "managedSiteModelSync:settings.viewExecutionDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "managedSiteModelSync:settings.title",
      ],
      keywords: [...SHARED_MODEL_SYNC_KEYWORDS, "execution", "history"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-redirect-enable",
    "managedSite",
    "managed-site-model-redirect-enable",
    "modelRedirect:enable",
    659,
    {
      descriptionKey: "modelRedirect:enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "modelRedirect:title",
      ],
      keywords: ["model redirect", "redirect"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-redirect-standard-models",
    "managedSite",
    "managed-site-model-redirect-standard-models",
    "modelRedirect:standardModels",
    660,
    {
      descriptionKey: "modelRedirect:standardModelsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "modelRedirect:title",
      ],
      keywords: ["model redirect", "standard models", "models"],
      isVisible: isStandardManagedSiteWithModelRedirect,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-redirect-prune-missing-targets",
    "managedSite",
    "managed-site-model-redirect-prune-missing-targets",
    "modelRedirect:pruneMissingTargetsOnModelSync",
    661,
    {
      descriptionKey: "modelRedirect:pruneMissingTargetsOnModelSyncDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "modelRedirect:title",
      ],
      keywords: ["model redirect", "prune", "missing targets", "model sync"],
      isVisible: isStandardManagedSiteWithModelRedirect,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-redirect-regenerate",
    "managedSite",
    "managed-site-model-redirect-regenerate",
    "modelRedirect:regenerateButton",
    662,
    {
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "modelRedirect:title",
      ],
      keywords: ["model redirect", "regenerate", "mapping"],
      isVisible: isStandardManagedSiteWithModelRedirect,
    },
  ),
  buildControlDefinition(
    "control:managed-site-model-redirect-bulk-clear",
    "managedSite",
    "managed-site-model-redirect-bulk-clear",
    "modelRedirect:bulkClear.action",
    663,
    {
      descriptionKey: "modelRedirect:bulkClear.actionDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "modelRedirect:title",
      ],
      keywords: ["model redirect", "bulk clear", "clear mappings"],
      isVisible: isStandardManagedSiteContext,
    },
  ),
]
