import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type {
  ManagedSiteChannelDraftRequestOptions,
  ManagedSiteChannelRequestOptions,
  ManagedSiteChannelSecretReadOptions,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { MANAGED_UPSTREAM_RESOURCE_FEATURES } from "~/services/managedSites/managedUpstreamResourceMigration"
import { resolveManagedUpstreamResourceFeatureCapabilities } from "~/services/managedSites/managedUpstreamResourceService"
import {
  MANAGED_SITE_MUTATION_CERTAINTIES,
  type ManagedSiteChannelDeleteResponse,
} from "~/services/managedSites/mutationCertainty"
import {
  toPrivateManagedSiteMutationOutput,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import {
  getCurrentManagedSiteRuntimeConfig,
  type ManagedSiteRuntimeConfigValue,
  type ManagedSiteRuntimeConfigValueForType,
} from "~/services/managedSites/runtimeConfig"
import { searchManagedUpstreamResourceChannelsForDuplicateMatching } from "~/services/managedSites/utils/channelMatching"
import type { ManagedSiteMessagesKey } from "~/services/managedSites/utils/managedSite"
import {
  getManagedSiteAdminConfig,
  getManagedSiteAdminConfigForType,
  getManagedSiteMessagesKeyFromSiteType,
} from "~/services/managedSites/utils/managedSite"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import type {
  ChannelFormData,
  ChannelMode,
  CreateChannelPayload,
  ManagedSiteChannel,
  ManagedSiteChannelListData,
  UpdateChannelPayload,
} from "~/types/managedSite"

import {
  userPreferences,
  type UserPreferences,
} from "../preferences/userPreferences"

export type ManagedSiteConfig = ManagedSiteRuntimeConfigValue
type LegacyManagedSiteMutationResponse = ManagedSiteChannelDeleteResponse

export interface ManagedSiteService<
  TConfig extends ManagedSiteConfig = ManagedSiteConfig,
  TSiteType extends ManagedSiteType = ManagedSiteType,
> {
  siteType: TSiteType
  messagesKey: ManagedSiteMessagesKey

  searchChannel(
    config: TConfig,
    keyword: string,
  ): Promise<ManagedSiteChannelListData | null>

  listChannels(
    config: TConfig,
    options?: ManagedSiteChannelRequestOptions,
  ): Promise<ManagedSiteChannelListData>

  createChannel(
    config: TConfig,
    channelData: CreateChannelPayload,
  ): Promise<LegacyManagedSiteMutationResponse>

  updateChannel(
    config: TConfig,
    channelData: UpdateChannelPayload,
  ): Promise<LegacyManagedSiteMutationResponse>

  deleteChannel(
    config: TConfig,
    channelId: number,
  ): Promise<LegacyManagedSiteMutationResponse>

  checkValidConfig(): Promise<boolean>
  getConfig(): Promise<TConfig | null>

  fetchSiteUserGroups(config: TConfig): Promise<string[]>

  fetchAccountAvailableModels(config: TConfig): Promise<string[]>

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

  buildChannelPayload(
    formData: ChannelFormData,
    mode?: ChannelMode,
  ): CreateChannelPayload

  searchResourceDuplicateChannels?(
    config: TConfig,
    params: { accountBaseUrl: string },
  ): Promise<ManagedSiteChannelListData | null>

  hydrateComparableChannelKeys?(
    config: TConfig,
    candidates: ManagedSiteChannel[],
    options?: ManagedSiteChannelSecretReadOptions,
  ): Promise<ManagedSiteChannel[]>

  fetchChannelSecretKey?(
    config: TConfig,
    channelId: number,
    options?: ManagedSiteChannelSecretReadOptions,
  ): Promise<string>
}

export type TypedManagedSiteService<TSiteType extends ManagedSiteType> =
  ManagedSiteService<ManagedSiteRuntimeConfigValueForType<TSiteType>, TSiteType>
type ManagedSiteCapabilities = NonNullable<
  ReturnType<typeof getSiteTypeCapabilities>["managedSites"]
>
type RequiredManagedSiteCapabilities = {
  channels: NonNullable<ManagedSiteCapabilities["channels"]>
  config: NonNullable<ManagedSiteCapabilities["config"]>
  queries: NonNullable<ManagedSiteCapabilities["queries"]>
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
    !managedSites?.channels ||
    !managedSites.config ||
    !managedSites.queries ||
    !managedSites.channelDrafts
  ) {
    throw new Error(
      `managedSites capabilities are not implemented for ${siteType}`,
    )
  }

  return {
    channels: managedSites.channels,
    config: managedSites.config,
    queries: managedSites.queries,
    channelDrafts: managedSites.channelDrafts,
  }
}

const getManagedSiteConfigSecrets = (config: ManagedSiteConfig) =>
  typeof config === "object" && config !== null
    ? Object.entries(config)
        .filter(
          ([key, value]) =>
            typeof value === "string" &&
            /(?:password|token|secret|apiKey|key)$/i.test(key),
        )
        .map(([, value]) => value as string)
    : []

/** Private temporary compatibility bridge; delete it in Task 9. */
const toLegacyMutationResponseDuringMigration = (
  config: ManagedSiteConfig,
  result: ManagedSiteMutationResult<unknown>,
  knownSecrets: readonly (string | undefined)[] = [],
): LegacyManagedSiteMutationResponse => {
  const output = toPrivateManagedSiteMutationOutput(result, {
    knownSecrets: [
      ...getManagedSiteConfigSecrets(config),
      ...knownSecrets.filter((secret): secret is string => Boolean(secret)),
    ],
  })

  if (result.outcome === "succeeded") {
    return {
      success: true,
      data: result.data,
      message: output.message ?? "success",
    }
  }

  return {
    success: false,
    data: null,
    message: output.message ?? "Mutation failed",
    ...(result.outcome === "partial" || result.outcome === "uncertain"
      ? { certainty: MANAGED_SITE_MUTATION_CERTAINTIES.Uncertain }
      : {}),
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
export function getManagedSiteServiceForType<TSiteType extends ManagedSiteType>(
  siteType: TSiteType,
): TypedManagedSiteService<TSiteType>
export function getManagedSiteServiceForType(
  siteType: ManagedSiteType,
): TypedManagedSiteService<ManagedSiteType> {
  const messagesKey: ManagedSiteMessagesKey =
    getManagedSiteMessagesKeyFromSiteType(siteType)
  const capabilities = requireManagedSiteCapabilities(siteType)
  const resourceDuplicateMatching =
    resolveManagedUpstreamResourceFeatureCapabilities(
      siteType,
      MANAGED_UPSTREAM_RESOURCE_FEATURES.DuplicateMatching,
    )

  return {
    siteType,
    messagesKey,
    searchChannel: capabilities.channels.search,
    listChannels: async (config, options) => {
      const channelList = capabilities.channels.list
        ? await capabilities.channels.list(config, options)
        : await capabilities.channels.search(config, "")

      return channelList ?? { items: [], total: 0, type_counts: {} }
    },
    createChannel: async (config, channelData) =>
      toLegacyMutationResponseDuringMigration(
        config,
        await capabilities.channels.create(config, channelData),
        [channelData.channel.key],
      ),
    updateChannel: async (config, channelData) =>
      toLegacyMutationResponseDuringMigration(
        config,
        await capabilities.channels.update(config, channelData),
        [channelData.key],
      ),
    deleteChannel: async (config, channelId) =>
      toLegacyMutationResponseDuringMigration(
        config,
        await capabilities.channels.delete(config, channelId),
      ),
    checkValidConfig: capabilities.config.checkValid,
    getConfig: capabilities.config.get,
    fetchSiteUserGroups: capabilities.queries.fetchSiteUserGroups,
    fetchAccountAvailableModels:
      capabilities.queries.fetchAccountAvailableModels,
    fetchAvailableModels: capabilities.channelDrafts.fetchAvailableModels,
    buildChannelName: capabilities.channelDrafts.buildName,
    prepareChannelFormData: capabilities.channelDrafts.prepareFormData,
    buildChannelPayload: capabilities.channelDrafts.buildPayload,
    ...(resourceDuplicateMatching.supported
      ? {
          searchResourceDuplicateChannels: async (config, params) =>
            await searchManagedUpstreamResourceChannelsForDuplicateMatching({
              resources: resourceDuplicateMatching.capabilities,
              config,
              accountBaseUrl: params.accountBaseUrl,
            }),
        }
      : {}),
    hydrateComparableChannelKeys: capabilities.channels.hydrateComparableKeys,
    fetchChannelSecretKey: capabilities.channels.fetchSecretKey,
  }
}
