import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import { userPreferences } from "~/services/preferences/userPreferences"

import {
  getManagedSiteConfigRegistration,
  type ManagedSiteRuntimeConfig,
  type ManagedSiteRuntimeConfigForType,
} from "./configRegistration"

export type {
  ManagedSiteRuntimeConfig,
  ManagedSiteRuntimeConfigForType,
  ManagedSiteRuntimeConfigValue,
  ManagedSiteRuntimeConfigValueForType,
} from "./configRegistration"

/** Returns the configured principal used by the persisted v1 repair receipt. */
export function getManagedSiteRuntimePrincipal(
  runtimeConfig: ManagedSiteRuntimeConfig,
): string {
  return getManagedSiteConfigRegistration(runtimeConfig.siteType)!.principal(
    runtimeConfig.config,
  )
}

/** Returns whether preferences contain any required-field input for a type. */
export function hasManagedSiteRuntimeConfigInputForType(
  preferences: UserPreferences,
  siteType: ManagedSiteType,
): boolean {
  return (
    getManagedSiteConfigRegistration(siteType)?.hasInput(preferences) ?? false
  )
}

/** Resolves a complete runtime config without supplying settings-only defaults. */
export function resolveManagedSiteRuntimeConfigForType<
  Type extends ManagedSiteType,
>(
  preferences: UserPreferences,
  siteType: Type,
): ManagedSiteRuntimeConfigForType<Type> | null {
  const registration = getManagedSiteConfigRegistration(siteType)
  if (!registration) return null
  const config = registration.resolve(preferences)
  return config
    ? ({ siteType, config } as ManagedSiteRuntimeConfigForType<Type>)
    : null
}

const hashStringForCache = (value: string) => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

/** Identifies active configuration changes without retaining credentials in cache keys. */
export function getManagedSiteRuntimeConfigFingerprint(
  preferences: UserPreferences,
  siteType: ManagedSiteType,
): string {
  const config = resolveManagedSiteRuntimeConfigForType(
    preferences,
    siteType,
  )?.config
  const configEntries = Object.entries(config ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )

  return [siteType, hashStringForCache(JSON.stringify(configEntries))].join("|")
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
export async function getManagedSiteRuntimeConfigForType<
  TSiteType extends ManagedSiteType,
>(
  siteType: TSiteType,
): Promise<ManagedSiteRuntimeConfigForType<TSiteType> | null> {
  try {
    const preferences = await userPreferences.getPreferences()
    return resolveManagedSiteRuntimeConfigForType(preferences, siteType)
  } catch {
    return null
  }
}

/** Loads the selected managed-site type even when its configuration is incomplete. */
export async function getCurrentManagedSiteType(): Promise<ManagedSiteType> {
  try {
    const preferences = await userPreferences.getPreferences()
    return preferences.managedSiteType || SITE_TYPES.NEW_API
  } catch {
    return SITE_TYPES.NEW_API
  }
}

/**
 * Check if preferences contain a valid managed site admin configuration.
 */
export function hasValidManagedSiteConfig(
  prefs: UserPreferences | null,
  siteType?: ManagedSiteType,
): boolean {
  if (!prefs) {
    return false
  }

  return Boolean(
    siteType
      ? resolveManagedSiteRuntimeConfigForType(prefs, siteType)?.config ?? null
      : resolveCurrentManagedSiteRuntimeConfig(prefs)?.config ?? null,
  )
}
