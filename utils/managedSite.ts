import {
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
  type ManagedSiteType,
} from "~/constants/siteType"
import type { UserPreferences } from "~/services/userPreferences"
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

export type ManagedSiteConfig =
  | NewApiConfig
  | DoneHubConfig
  | VeloeraConfig
  | OctopusConfig

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
  const { siteType, config } = getManagedSiteConfigFromPreferences(preferences)

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
 * Returns both the selected managed site type and its corresponding i18n messages key.
 */
export function getManagedSiteContext(prefs: UserPreferences): {
  siteType: ManagedSiteType
  messagesKey: ManagedSiteMessagesKey
} {
  const siteType = getManagedSiteType(prefs)
  return {
    siteType,
    messagesKey: getManagedSiteMessagesKeyFromSiteType(siteType),
  }
}

/**
 * Returns the current managed site messages key.
 */
export function getManagedSiteMessagesKey(
  prefs: UserPreferences,
): ManagedSiteMessagesKey {
  const { messagesKey } = getManagedSiteContext(prefs)
  return messagesKey
}
