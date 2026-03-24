import type { TFunction } from "i18next"

import {
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
  type ManagedSiteType,
} from "~/constants/siteType"
import { hasUsableApiTokenKey } from "~/services/apiService/common/apiKey"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  DEFAULT_DONE_HUB_CONFIG,
  type DoneHubConfig,
} from "~/types/doneHubConfig"
import type { NewApiConfig } from "~/types/newApiConfig"
import type { OctopusConfig } from "~/types/octopusConfig"
import type { VeloeraConfig } from "~/types/veloeraConfig"

export type ManagedSiteLabelKey =
  | "settings:managedSite.newApi"
  | "settings:managedSite.doneHub"
  | "settings:managedSite.veloera"
  | "settings:managedSite.octopus"

/**
 * Managed site namespace key used under the `messages` i18n namespace.
 */
export type ManagedSiteMessagesKey =
  | "newapi"
  | "donehub"
  | "veloera"
  | "octopus"

export interface ManagedSiteAdminConfig {
  baseUrl: string
  adminToken: string
  userId: string
}

export interface ManagedSiteTargetOption {
  siteType: ManagedSiteType
  labelKey: ManagedSiteLabelKey
  messagesKey: ManagedSiteMessagesKey
  config: ManagedSiteAdminConfig
}

type ManagedSiteConfig =
  | NewApiConfig
  | DoneHubConfig
  | VeloeraConfig
  | OctopusConfig

/**
 * Extracts the selected managed site type and its corresponding config from a
 * given preferences snapshot.
 */
function getManagedSiteConfigFromPreferencesForType(
  preferences: UserPreferences,
  siteType: ManagedSiteType,
): {
  siteType: ManagedSiteType
  config: ManagedSiteConfig
} {
  let config: ManagedSiteConfig
  if (siteType === OCTOPUS) {
    config = preferences.octopus || { baseUrl: "", username: "", password: "" }
  } else if (siteType === DONE_HUB) {
    config = preferences.doneHub ?? DEFAULT_DONE_HUB_CONFIG
  } else if (siteType === VELOERA) {
    config = preferences.veloera
  } else {
    config = preferences.newApi
  }
  return { siteType, config }
}

/**
 * Extracts the selected managed site type and its corresponding config from a
 * given preferences snapshot.
 */
export function getManagedSiteConfigFromPreferences(
  preferences: UserPreferences,
): {
  siteType: ManagedSiteType
  config: ManagedSiteConfig
} {
  const siteType: ManagedSiteType = preferences.managedSiteType || NEW_API
  return getManagedSiteConfigFromPreferencesForType(preferences, siteType)
}

/**
 * Convenience wrapper for retrieving the managed site type + config.
 */
export function getManagedSiteConfig(prefs: UserPreferences): {
  siteType: ManagedSiteType
  config: ManagedSiteConfig
} {
  return getManagedSiteConfigFromPreferences(prefs)
}

/**
 * Returns the i18n key for the managed site label shown in UI.
 */
export function getManagedSiteLabelKey(
  siteType: ManagedSiteType,
): ManagedSiteLabelKey {
  if (siteType === OCTOPUS) {
    return "settings:managedSite.octopus"
  }
  if (siteType === DONE_HUB) {
    return "settings:managedSite.doneHub"
  }
  return siteType === VELOERA
    ? "settings:managedSite.veloera"
    : "settings:managedSite.newApi"
}

/**
 * Returns the translated managed-site label for the given site type.
 */
export function getManagedSiteLabel(t: TFunction, siteType: ManagedSiteType) {
  switch (siteType) {
    case OCTOPUS:
      return t("settings:managedSite.octopus")
    case DONE_HUB:
      return t("settings:managedSite.doneHub")
    case VELOERA:
      return t("settings:managedSite.veloera")
    case NEW_API:
    default:
      return t("settings:managedSite.newApi")
  }
}

/**
 * Returns the `messages` namespace key for the selected managed site type.
 */
export function getManagedSiteMessagesKeyFromSiteType(
  siteType: ManagedSiteType,
): ManagedSiteMessagesKey {
  if (siteType === OCTOPUS) {
    return "octopus"
  }
  if (siteType === DONE_HUB) {
    return "donehub"
  }
  return siteType === VELOERA ? "veloera" : "newapi"
}

/**
 * Extracts the current managed site admin config from user preferences.
 *
 * Note: this intentionally reads `preferences.managedSiteType` to ensure the
 * returned config always matches the real selected managed site type.
 */
export function getManagedSiteAdminConfig(
  preferences: UserPreferences,
): ManagedSiteAdminConfig | null {
  const siteType = getManagedSiteType(preferences)
  return getManagedSiteAdminConfigForType(preferences, siteType)
}

/**
 * Extracts a managed-site admin config for an explicit target site type.
 */
export function getManagedSiteAdminConfigForType(
  preferences: UserPreferences,
  siteType: ManagedSiteType,
): ManagedSiteAdminConfig | null {
  const { config } = getManagedSiteConfigFromPreferencesForType(
    preferences,
    siteType,
  )

  // Octopus 使用不同的配置结构
  if (siteType === OCTOPUS) {
    const octopusConfig = config as OctopusConfig
    if (
      !octopusConfig?.baseUrl ||
      !octopusConfig?.username ||
      !octopusConfig?.password
    ) {
      return null
    }
    return {
      baseUrl: octopusConfig.baseUrl,
      adminToken: "", // Octopus 使用 JWT，动态获取
      userId: octopusConfig.username,
    }
  }

  // New API / Done Hub / Veloera 使用 adminToken
  const legacyConfig = config as NewApiConfig | DoneHubConfig | VeloeraConfig
  if (
    !legacyConfig?.baseUrl ||
    !legacyConfig?.adminToken ||
    !legacyConfig?.userId
  ) {
    return null
  }

  return {
    baseUrl: legacyConfig.baseUrl,
    adminToken: legacyConfig.adminToken,
    userId: legacyConfig.userId,
  }
}

/**
 * Gets the current managed site type from user preferences.
 */
export function getManagedSiteType(prefs: UserPreferences): ManagedSiteType {
  return prefs.managedSiteType || NEW_API
}

/**
 * Whether the managed-site provider can reliably find channels by normalized
 * base URL for non-mutating review/navigation flows.
 */
export function supportsManagedSiteBaseUrlChannelLookup(
  siteType: ManagedSiteType,
): boolean {
  return siteType !== VELOERA
}

/**
 * Returns both the selected managed site type and its corresponding i18n messages key.
 */
export function getManagedSiteContext(prefs: UserPreferences): {
  siteType: ManagedSiteType
  messagesKey: ManagedSiteMessagesKey
} {
  const siteType = getManagedSiteType(prefs)
  return getManagedSiteContextForType(siteType)
}

/**
 * Returns managed-site UI + i18n context for an explicit site type.
 */
export function getManagedSiteContextForType(siteType: ManagedSiteType): {
  siteType: ManagedSiteType
  messagesKey: ManagedSiteMessagesKey
} {
  return {
    siteType,
    messagesKey: getManagedSiteMessagesKeyFromSiteType(siteType),
  }
}

/**
 * Enumerates fully configured managed-site targets that can be used for
 * cross-site operations such as channel migration.
 */
export function getManagedSiteTargetOptions(
  preferences: UserPreferences,
  options?: {
    excludeSiteTypes?: ManagedSiteType[]
  },
): ManagedSiteTargetOption[] {
  const excluded = new Set(options?.excludeSiteTypes ?? [])
  const siteTypes: ManagedSiteType[] = [NEW_API, VELOERA, DONE_HUB, OCTOPUS]

  return siteTypes
    .filter((siteType) => !excluded.has(siteType))
    .map((siteType) => {
      const config = getManagedSiteAdminConfigForType(preferences, siteType)
      if (!config) return null

      return {
        siteType,
        labelKey: getManagedSiteLabelKey(siteType),
        messagesKey: getManagedSiteMessagesKeyFromSiteType(siteType),
        config,
      } satisfies ManagedSiteTargetOption
    })
    .filter((item): item is ManagedSiteTargetOption => item !== null)
}

/**
 * Returns true when a managed-site channel key can be used directly as a real
 * credential rather than a masked inventory placeholder.
 */
export function hasUsableManagedSiteChannelKey(key?: string | null): boolean {
  const trimmed = key?.trim() ?? ""
  return hasUsableApiTokenKey(trimmed)
}

/**
 * Returns true when the source channel key must be hydrated from a detail or
 * verification flow before it can be reused safely.
 */
export function needsManagedSiteChannelKeyResolution(
  key?: string | null,
): boolean {
  return !hasUsableManagedSiteChannelKey(key)
}

/**
 * Returns the translated config-missing message for the selected managed-site backend.
 */
export function getManagedSiteConfigMissingMessage(
  t: TFunction,
  messagesKey: ManagedSiteMessagesKey,
) {
  switch (messagesKey) {
    case "donehub":
      return t("messages:donehub.configMissing")
    case "veloera":
      return t("messages:veloera.configMissing")
    case "octopus":
      return t("messages:octopus.configMissing")
    case "newapi":
    default:
      return t("messages:newapi.configMissing")
  }
}

/**
 * Returns the translated no-channels-to-sync message for the selected managed-site backend.
 */
export function getManagedSiteNoChannelsToSyncMessage(
  t: TFunction,
  messagesKey: ManagedSiteMessagesKey,
) {
  switch (messagesKey) {
    case "donehub":
      return t("messages:donehub.noChannelsToSync")
    case "veloera":
      return t("messages:veloera.noChannelsToSync")
    case "octopus":
      return t("messages:octopus.noChannelsToSync")
    case "newapi":
    default:
      return t("messages:newapi.noChannelsToSync")
  }
}
