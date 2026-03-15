import {
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  MatchResolutionUnresolvedError,
  type ManagedSiteChannelMatchInspection,
} from "~/services/managedSites/channelMatch"
import type {
  ManagedSiteConfig,
  ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import {
  findManagedSiteChannelsByBaseUrl,
  inspectManagedSiteChannelKeyMatch,
  inspectManagedSiteChannelModelsMatch,
  normalizeManagedSiteChannelBaseUrl,
} from "~/services/managedSites/utils/channelMatching"

interface ResolveManagedSiteChannelMatchParams {
  service: ManagedSiteService
  managedConfig: ManagedSiteConfig
  accountBaseUrl: string
  models: string[]
  key?: string
  resolvedChannelKeysById?: Record<number, string>
}

const applyResolvedChannelKeys = <T extends { id: number; key?: string }>(
  channels: T[],
  resolvedChannelKeysById?: Record<number, string>,
) => {
  if (
    !resolvedChannelKeysById ||
    Object.keys(resolvedChannelKeysById).length === 0
  ) {
    return channels
  }

  return channels.map((channel) => {
    const resolvedKey = resolvedChannelKeysById[channel.id]

    if (typeof resolvedKey !== "string") {
      return channel
    }

    return {
      ...channel,
      key: resolvedKey,
    }
  })
}

/**
 * Resolves the strongest available managed-site channel match while preserving
 * provider-specific exact-key checks before local ranked fallback.
 */
export async function resolveManagedSiteChannelMatch(
  params: ResolveManagedSiteChannelMatchParams,
): Promise<ManagedSiteChannelMatchInspection> {
  const { service, managedConfig, models, key, resolvedChannelKeysById } =
    params
  const searchBaseUrl = normalizeManagedSiteChannelBaseUrl(
    params.accountBaseUrl,
  )

  const searchResults = await service.searchChannel(
    managedConfig.baseUrl,
    managedConfig.token,
    managedConfig.userId,
    searchBaseUrl,
  )

  if (!searchResults) {
    return {
      searchBaseUrl,
      searchCompleted: false,
      url: {
        matched: false,
        channel: null,
        candidateCount: 0,
      },
      key: inspectManagedSiteChannelKeyMatch({
        channels: [],
        accountBaseUrl: searchBaseUrl,
        key,
      }),
      models: inspectManagedSiteChannelModelsMatch({
        channels: [],
        accountBaseUrl: searchBaseUrl,
        models,
      }),
    }
  }

  const channels = applyResolvedChannelKeys(
    Array.isArray(searchResults.items) ? searchResults.items : [],
    resolvedChannelKeysById,
  )
  const urlBucket = findManagedSiteChannelsByBaseUrl({
    channels,
    accountBaseUrl: searchBaseUrl,
  })
  let keyAssessment = inspectManagedSiteChannelKeyMatch({
    channels,
    accountBaseUrl: searchBaseUrl,
    key,
  })
  let modelsAssessment = inspectManagedSiteChannelModelsMatch({
    channels,
    accountBaseUrl: searchBaseUrl,
    models,
  })

  const hasLocalExactMatch =
    keyAssessment.matched &&
    modelsAssessment.matched &&
    modelsAssessment.reason ===
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT &&
    keyAssessment.channel?.id != null &&
    keyAssessment.channel.id === modelsAssessment.channel?.id

  if (key?.trim() && models.length > 0 && !hasLocalExactMatch) {
    let exactMatch = null

    try {
      exactMatch = await service.findMatchingChannel(
        managedConfig.baseUrl,
        managedConfig.token,
        managedConfig.userId,
        searchBaseUrl,
        models,
        key,
      )
    } catch (error) {
      if (!(error instanceof MatchResolutionUnresolvedError)) {
        throw error
      }
    }

    if (exactMatch) {
      keyAssessment = inspectManagedSiteChannelKeyMatch({
        channels,
        accountBaseUrl: searchBaseUrl,
        key,
        exactChannel: exactMatch,
      })
      modelsAssessment = inspectManagedSiteChannelModelsMatch({
        channels,
        accountBaseUrl: searchBaseUrl,
        models,
        exactChannel: exactMatch,
      })
    }
  }

  const resolvedUrlChannel =
    urlBucket[0] ?? keyAssessment.channel ?? modelsAssessment.channel

  return {
    searchBaseUrl,
    searchCompleted: true,
    url: {
      matched: urlBucket.length > 0 || resolvedUrlChannel != null,
      channel: resolvedUrlChannel,
      candidateCount:
        urlBucket.length > 0 ? urlBucket.length : resolvedUrlChannel ? 1 : 0,
    },
    key: keyAssessment,
    models: modelsAssessment,
  }
}
