import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftRequestOptions,
  ManagedSiteChannelSecretReadOptions,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  getCurrentManagedSiteRuntimeConfig,
  type ManagedSiteRuntimeConfigValue,
  type ManagedSiteRuntimeConfigValueForType,
} from "~/services/managedSites/runtimeConfig"
import type { ManagedSiteMessagesKey } from "~/services/managedSites/utils/managedSite"
import {
  getManagedSiteAdminConfig,
  getManagedSiteAdminConfigForType,
  getManagedSiteMessagesKeyFromSiteType,
} from "~/services/managedSites/utils/managedSite"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import type {
  ManagedResourceMatchCandidate,
  ManagedResourceMatchList,
} from "~/types/managedResourceMatching"
import type { ChannelFormData } from "~/types/managedSite"

import {
  userPreferences,
  type UserPreferences,
} from "../preferences/userPreferences"

export type ManagedSiteConfig = ManagedSiteRuntimeConfigValue

export interface ManagedSiteService<
  TConfig extends ManagedSiteConfig = ManagedSiteConfig,
  TSiteType extends ManagedSiteType = ManagedSiteType,
> {
  siteType: TSiteType
  messagesKey: ManagedSiteMessagesKey

  searchChannel(
    config: TConfig,
    keyword: string,
  ): Promise<ManagedResourceMatchList | null>

  checkValidConfig(): Promise<boolean>
  getConfig(): Promise<TConfig | null>

  fetchSiteUserGroups?(config: TConfig): Promise<string[]>

  fetchAccountAvailableModels?(config: TConfig): Promise<string[]>

  fetchAvailableModels(
    account: DisplaySiteData,
    token: ApiToken,
  ): Promise<string[]>

  buildChannelName(account: DisplaySiteData, token: ApiToken): string

  prepareChannelFormData(
    account: DisplaySiteData,
    token: ApiToken | AccountToken,
    options?: ManagedSiteChannelDraftRequestOptions,
  ): Promise<ChannelFormData>

  hydrateComparableChannelKeys?(
    config: TConfig,
    candidates: ManagedResourceMatchCandidate[],
    options?: ManagedSiteChannelSecretReadOptions,
  ): Promise<ManagedResourceMatchCandidate[]>

  fetchChannelSecretKey?(
    config: TConfig,
    channelId: number | string,
    options?: ManagedSiteChannelSecretReadOptions,
  ): Promise<string>
}

export type TypedManagedSiteService<TSiteType extends ManagedSiteType> =
  ManagedSiteService<ManagedSiteRuntimeConfigValueForType<TSiteType>, TSiteType>
type ManagedSiteCapabilities = NonNullable<
  ReturnType<typeof getSiteTypeCapabilities>["managedSites"]
>
type RequiredManagedSiteCapabilities = {
  matching: NonNullable<ManagedSiteCapabilities["matching"]>
  config: NonNullable<ManagedSiteCapabilities["config"]>
  queries?: ManagedSiteCapabilities["queries"]
  channelDrafts: NonNullable<ManagedSiteCapabilities["channelDrafts"]>
}

/**
 * Resolves the full managed-site capability set required by the service facade.
 */
function requireManagedSiteCapabilities(
  siteType: ManagedSiteType,
): RequiredManagedSiteCapabilities {
  const managedSites = getSiteTypeCapabilities(siteType).managedSites

  if (
    !managedSites?.matching ||
    !managedSites.config ||
    !managedSites.channelDrafts
  ) {
    throw new Error(
      `managedSites capabilities are not implemented for ${siteType}`,
    )
  }

  return {
    matching: managedSites.matching,
    config: managedSites.config,
    queries: managedSites.queries,
    channelDrafts: managedSites.channelDrafts,
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
      ? getManagedSiteAdminConfigForType(prefs, siteType)
      : getManagedSiteAdminConfig(prefs),
  )
}

/**
 * Resolve the managed site service implementation based on preferences.
 */
export async function getManagedSiteService(): Promise<ManagedSiteService> {
  const runtimeConfig = await getCurrentManagedSiteRuntimeConfig()
  if (runtimeConfig) {
    return getManagedSiteServiceForType(runtimeConfig.siteType)
  }

  try {
    const preferences = await userPreferences.getPreferences()
    return getManagedSiteServiceForType(
      preferences.managedSiteType || SITE_TYPES.NEW_API,
    )
  } catch {
    return getManagedSiteServiceForType(SITE_TYPES.NEW_API)
  }
}

/**
 * Resolve the managed site service implementation for an explicit site type.
 */
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.OCTOPUS,
): TypedManagedSiteService<typeof SITE_TYPES.OCTOPUS>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.AXON_HUB,
): TypedManagedSiteService<typeof SITE_TYPES.AXON_HUB>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.CLAUDE_CODE_HUB,
): TypedManagedSiteService<typeof SITE_TYPES.CLAUDE_CODE_HUB>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.VELOERA,
): TypedManagedSiteService<typeof SITE_TYPES.VELOERA>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.DONE_HUB,
): TypedManagedSiteService<typeof SITE_TYPES.DONE_HUB>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.NEW_API,
): TypedManagedSiteService<typeof SITE_TYPES.NEW_API>
export function getManagedSiteServiceForType(
  siteType: typeof SITE_TYPES.SUB2API,
): TypedManagedSiteService<typeof SITE_TYPES.SUB2API>
export function getManagedSiteServiceForType<TSiteType extends ManagedSiteType>(
  siteType: TSiteType,
): TypedManagedSiteService<TSiteType>
export function getManagedSiteServiceForType(
  siteType: ManagedSiteType,
): TypedManagedSiteService<ManagedSiteType> {
  const messagesKey: ManagedSiteMessagesKey =
    getManagedSiteMessagesKeyFromSiteType(siteType)
  const capabilities = requireManagedSiteCapabilities(siteType)

  return {
    siteType,
    messagesKey,
    searchChannel: capabilities.matching.search,
    checkValidConfig: capabilities.config.checkValid,
    getConfig: capabilities.config.get,
    ...(capabilities.queries?.siteUserGroups
      ? { fetchSiteUserGroups: capabilities.queries.siteUserGroups.fetch }
      : {}),
    ...(capabilities.queries?.accountAvailableModels
      ? {
          fetchAccountAvailableModels:
            capabilities.queries.accountAvailableModels.fetch,
        }
      : {}),
    fetchAvailableModels: capabilities.channelDrafts.fetchAvailableModels,
    buildChannelName: capabilities.channelDrafts.buildName,
    prepareChannelFormData: capabilities.channelDrafts.prepareFormData,
    hydrateComparableChannelKeys: capabilities.matching.hydrateComparableKeys,
    fetchChannelSecretKey: capabilities.matching.fetchSecretKey,
  }
}
