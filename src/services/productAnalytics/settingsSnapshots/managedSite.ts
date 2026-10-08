import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import {
  PRODUCT_ANALYTICS_SETTING_IDS,
  type ProductAnalyticsEntrypoint,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/facts/managedSite"
import { deepOverride } from "~/utils"

import {
  hasText,
  normalizeNonNegativeInteger,
  normalizeNonNegativeMinutes,
  type SettingChangedPayload,
} from "./values"
import type { SettingsSnapshotProjection } from "./values"

/** Project managed site into privacy-reviewed analytics facts. */
function buildManagedSiteSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteConfigSnapshot,
    entrypoint,
    managed_site_type:
      resolveProductAnalyticsManagedSiteType(preferences.managedSiteType) ??
      SITE_TYPES.NEW_API,
    new_api_configured: isNewApiConfigured(preferences.newApi),
    done_hub_configured: isDoneHubConfigured(preferences.doneHub),
    veloera_configured: isVeloeraConfigured(preferences.veloera),
    octopus_configured: isOctopusConfigured(preferences.octopus),
    axon_hub_configured: isAxonHubConfigured(preferences.axonHub),
    claude_code_hub_configured: isClaudeCodeHubConfigured(
      preferences.claudeCodeHub,
    ),
    cli_proxy_configured: isCliProxyApiConfigured(preferences.cliProxyApi),
    omniroute_configured: isOmniRouteConfigured(preferences.omniroute),
    gpt_load_configured: isGptLoadConfigured(preferences.gptLoad),
    claude_code_router_configured: isClaudeCodeRouterConfigured(
      preferences.claudeCodeRouter,
    ),
  }
}

/** Check new api configured readiness without exposing connection values. */
function isNewApiConfigured(config: UserPreferences["newApi"]): boolean {
  return hasText(config.baseUrl) && hasText(config.adminToken)
}

/** Check done hub configured readiness without exposing connection values. */
function isDoneHubConfigured(config: UserPreferences["doneHub"]): boolean {
  return Boolean(
    config && hasText(config.baseUrl) && hasText(config.adminToken),
  )
}

/** Check veloera configured readiness without exposing connection values. */
function isVeloeraConfigured(config: UserPreferences["veloera"]): boolean {
  return hasText(config.baseUrl) && hasText(config.adminToken)
}

/** Check octopus configured readiness without exposing connection values. */
function isOctopusConfigured(config: UserPreferences["octopus"]): boolean {
  return Boolean(config && hasText(config.baseUrl) && hasText(config.username))
}

/** Check axon hub configured readiness without exposing connection values. */
function isAxonHubConfigured(config: UserPreferences["axonHub"]): boolean {
  return Boolean(config && hasText(config.baseUrl) && hasText(config.email))
}

/** Check claude code hub configured readiness without exposing connection values. */
function isClaudeCodeHubConfigured(
  config: UserPreferences["claudeCodeHub"],
): boolean {
  return Boolean(
    config && hasText(config.baseUrl) && hasText(config.adminToken),
  )
}

/** Check cli proxy api configured readiness without exposing connection values. */
function isCliProxyApiConfigured(
  config: UserPreferences["cliProxyApi"],
): boolean {
  return Boolean(
    config && hasText(config.baseUrl) && hasText(config.adminToken),
  )
}

/** Check omni route configured readiness without exposing connection values. */
function isOmniRouteConfigured(config: UserPreferences["omniroute"]): boolean {
  return Boolean(config && hasText(config.baseUrl) && hasText(config.token))
}

/** Check gpt load configured readiness without exposing connection values. */
function isGptLoadConfigured(config: UserPreferences["gptLoad"]): boolean {
  return Boolean(
    config && hasText(config.baseUrl) && hasText(config.managementKey),
  )
}

/** Check claude code router configured readiness without exposing connection values. */
function isClaudeCodeRouterConfigured(
  config: UserPreferences["claudeCodeRouter"],
): boolean {
  return Boolean(config && hasText(config.baseUrl) && hasText(config.apiKey))
}

/** Project managed site model sync into privacy-reviewed analytics facts. */
function buildManagedSiteModelSyncSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = getManagedSiteModelSyncPreferences(preferences)
  return {
    setting_id:
      PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteModelSyncConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    sync_interval_minutes: normalizeNonNegativeMinutes(
      config.interval / 60_000,
    ),
    concurrency: normalizeNonNegativeInteger(config.concurrency),
    retry_max_attempts: normalizeNonNegativeInteger(config.maxRetries),
    channel_timeout_seconds: normalizeNonNegativeInteger(
      config.channelProcessingTimeout,
    ),
    rate_limit_rpm: normalizeNonNegativeInteger(
      config.rateLimit.requestsPerMinute,
    ),
    rate_limit_burst: normalizeNonNegativeInteger(config.rateLimit.burst),
    allowed_models_configured: (config.allowedModels ?? []).length > 0,
    global_filters_configured:
      (config.globalChannelModelFilters ?? []).length > 0,
  }
}

/** Apply current or legacy model-sync defaults before projection. */
function getManagedSiteModelSyncPreferences(
  preferences: UserPreferences,
): UserManagedSiteModelSyncConfig {
  return deepOverride(
    DEFAULT_PREFERENCES.managedSiteModelSync!,
    preferences.managedSiteModelSync ??
      preferences.newApiModelSync ??
      DEFAULT_PREFERENCES.managedSiteModelSync!,
  )
}

type UserManagedSiteModelSyncConfig = NonNullable<
  UserPreferences["managedSiteModelSync"]
>

/** Keep patch attribution beside the safe projection of each settings area. */
export const managedSiteSettingsSnapshots = {
  managedSite: {
    keys: [
      "managedSiteType",
      "newApi",
      "doneHub",
      "veloera",
      "octopus",
      "axonHub",
      "claudeCodeHub",
      "omniroute",
      "gptLoad",
      "cliProxyApi",
      "claudeCodeRouter",
    ],
    build: buildManagedSiteSnapshot,
  },
  managedSiteModelSync: {
    keys: ["managedSiteModelSync", "newApiModelSync"],
    build: buildManagedSiteModelSyncSnapshot,
  },
} satisfies Record<string, SettingsSnapshotProjection>
