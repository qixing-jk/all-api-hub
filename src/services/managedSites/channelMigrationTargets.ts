import { MANAGED_SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type {
  ManagedSiteLabelKey,
  ManagedSiteMessagesKey,
} from "~/services/accountSiteDefinitions/contracts"
import type { UserPreferences } from "~/services/preferences/userPreferences"

import { resolveManagedSiteMigrationCapability } from "./channelMigrationCapabilityRegistry"
import {
  resolveManagedSiteRuntimeConfigForType,
  type ManagedSiteRuntimeConfigValue,
} from "./runtimeConfig"
import {
  getManagedSiteLabelKey,
  getManagedSiteMessagesKeyFromSiteType,
} from "./utils/managedSite"

export interface ManagedSiteTargetOption {
  siteType: ManagedSiteType
  labelKey: ManagedSiteLabelKey
  messagesKey: ManagedSiteMessagesKey
  config: ManagedSiteRuntimeConfigValue
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
  return MANAGED_SITE_TYPES.filter(
    (siteType) =>
      !excluded.has(siteType) &&
      resolveManagedSiteMigrationCapability(siteType) !== null,
  )
    .map((siteType) => {
      const config =
        resolveManagedSiteRuntimeConfigForType(preferences, siteType)?.config ??
        null
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
