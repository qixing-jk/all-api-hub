import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { isManagedSiteAdminUserId } from "~/services/managedSites/utils/adminUserId"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type { AxonHubConfig } from "~/types/axonHubConfig"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import type { NewApiConfig } from "~/types/newApiConfig"
import type { OctopusConfig } from "~/types/octopusConfig"
import type { VeloeraConfig } from "~/types/veloeraConfig"

interface ManagedSiteLegacyAdminConfig {
  baseUrl: string
  adminToken: string
  userId: string
}

export type ManagedSiteRuntimeConfig =
  | { siteType: typeof SITE_TYPES.NEW_API; config: NewApiConfig }
  | { siteType: typeof SITE_TYPES.DONE_HUB; config: DoneHubConfig }
  | { siteType: typeof SITE_TYPES.VELOERA; config: VeloeraConfig }
  | { siteType: typeof SITE_TYPES.OCTOPUS; config: OctopusConfig }
  | { siteType: typeof SITE_TYPES.AXON_HUB; config: AxonHubConfig }
  | {
      siteType: typeof SITE_TYPES.CLAUDE_CODE_HUB
      config: ClaudeCodeHubConfig
    }

export type ManagedSiteRuntimeConfigValue = ManagedSiteRuntimeConfig["config"]
export type ManagedSiteRuntimeConfigForType<TSiteType extends ManagedSiteType> =
  Extract<ManagedSiteRuntimeConfig, { siteType: TSiteType }>
export type ManagedSiteRuntimeConfigValueForType<
  TSiteType extends ManagedSiteType,
> = ManagedSiteRuntimeConfigForType<TSiteType>["config"]

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

/**
 * Returns a complete access-token managed-site config when required fields exist.
 */
function resolveAccessTokenConfig(
  config: NewApiConfig | DoneHubConfig | VeloeraConfig | undefined,
) {
  if (!config) return null
  if (!hasText(config.baseUrl) || !hasText(config.adminToken)) return null
  if (!isManagedSiteAdminUserId(config.userId)) return null
  return config
}

/**
 * Resolves the full runtime config for an explicit managed-site type.
 */
export function resolveManagedSiteRuntimeConfigForType<
  TSiteType extends ManagedSiteType,
>(
  preferences: UserPreferences,
  siteType: TSiteType,
): ManagedSiteRuntimeConfigForType<TSiteType> | null {
  if (siteType === SITE_TYPES.OCTOPUS) {
    const config = preferences.octopus
    if (
      !config ||
      !hasText(config.baseUrl) ||
      !hasText(config.username) ||
      !hasText(config.password)
    ) {
      return null
    }
    return { siteType, config } as ManagedSiteRuntimeConfigForType<TSiteType>
  }

  if (siteType === SITE_TYPES.AXON_HUB) {
    const config = preferences.axonHub
    if (
      !config ||
      !hasText(config.baseUrl) ||
      !hasText(config.email) ||
      !hasText(config.password)
    ) {
      return null
    }
    return { siteType, config } as ManagedSiteRuntimeConfigForType<TSiteType>
  }

  if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    const config = preferences.claudeCodeHub
    if (!config || !hasText(config.baseUrl) || !hasText(config.adminToken)) {
      return null
    }
    return { siteType, config } as ManagedSiteRuntimeConfigForType<TSiteType>
  }

  if (siteType === SITE_TYPES.DONE_HUB) {
    const config = resolveAccessTokenConfig(preferences.doneHub)
    return config
      ? ({ siteType, config } as ManagedSiteRuntimeConfigForType<TSiteType>)
      : null
  }

  if (siteType === SITE_TYPES.VELOERA) {
    const config = resolveAccessTokenConfig(preferences.veloera)
    return config
      ? ({ siteType, config } as ManagedSiteRuntimeConfigForType<TSiteType>)
      : null
  }

  if (siteType === SITE_TYPES.NEW_API) {
    const config = resolveAccessTokenConfig(preferences.newApi)
    return config
      ? ({ siteType, config } as ManagedSiteRuntimeConfigForType<TSiteType>)
      : null
  }

  const exhaustiveSiteType: never = siteType
  return exhaustiveSiteType
}

/**
 * Resolves the runtime config for the currently selected managed-site type.
 */
export function resolveCurrentManagedSiteRuntimeConfig(
  preferences: UserPreferences,
): ManagedSiteRuntimeConfig | null {
  return resolveManagedSiteRuntimeConfigForType(
    preferences,
    preferences.managedSiteType || SITE_TYPES.NEW_API,
  )
}

/**
 * Loads preferences and resolves the currently selected managed-site runtime config.
 */
export async function getCurrentManagedSiteRuntimeConfig(): Promise<ManagedSiteRuntimeConfig | null> {
  try {
    const preferences = await userPreferences.getPreferences()
    return resolveCurrentManagedSiteRuntimeConfig(preferences)
  } catch {
    return null
  }
}

/**
 * Loads preferences and resolves a runtime config for an explicit site type.
 */
export async function getManagedSiteRuntimeConfigForType(
  siteType: ManagedSiteType,
): Promise<ManagedSiteRuntimeConfig | null> {
  try {
    const preferences = await userPreferences.getPreferences()
    return resolveManagedSiteRuntimeConfigForType(preferences, siteType)
  } catch {
    return null
  }
}

/**
 * Converts a runtime config to the legacy admin shape for compatibility callers.
 */
export function getManagedSiteLegacyAdminConfig(
  runtimeConfig: ManagedSiteRuntimeConfig,
): ManagedSiteLegacyAdminConfig {
  if (runtimeConfig.siteType === SITE_TYPES.OCTOPUS) {
    return {
      baseUrl: runtimeConfig.config.baseUrl,
      adminToken: "",
      userId: runtimeConfig.config.username,
    }
  }

  if (runtimeConfig.siteType === SITE_TYPES.AXON_HUB) {
    return {
      baseUrl: runtimeConfig.config.baseUrl,
      adminToken: runtimeConfig.config.password,
      userId: runtimeConfig.config.email,
    }
  }

  if (runtimeConfig.siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    return {
      baseUrl: runtimeConfig.config.baseUrl,
      adminToken: runtimeConfig.config.adminToken,
      userId: "admin",
    }
  }

  return {
    baseUrl: runtimeConfig.config.baseUrl,
    adminToken: runtimeConfig.config.adminToken,
    userId: runtimeConfig.config.userId,
  }
}
