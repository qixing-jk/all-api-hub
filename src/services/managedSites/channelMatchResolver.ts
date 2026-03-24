import {
  getRecoverableManagedSiteChannelCandidate,
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
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
  resolveHiddenKeys?: boolean
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

const fetchRecoverableCandidateSecretKey = async (params: {
  service: ManagedSiteService
  managedConfig: ManagedSiteConfig
  channelId: number
}) => {
  try {
    return await params.service.fetchChannelSecretKey!(
      params.managedConfig.baseUrl,
      params.managedConfig.token,
      params.managedConfig.userId,
      params.channelId,
    )
  } catch (error) {
    if (error instanceof MatchResolutionUnresolvedError) {
      throw error
    }

    throw new MatchResolutionUnresolvedError(
      MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
    )
  }
}

/**
 * Resolves the strongest available managed-site channel match while preserving
 * provider-specific exact-key checks before local ranked fallback.
 */
export async function resolveManagedSiteChannelMatch(
  params: ResolveManagedSiteChannelMatchParams,
): Promise<ManagedSiteChannelMatchInspection> {
  const {
    service,
    managedConfig,
    models,
    key,
    resolvedChannelKeysById,
    resolveHiddenKeys = false,
  } = params
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

  const searchResultItems = Array.isArray(searchResults.items)
    ? searchResults.items
    : []
  const mergedResolvedChannelKeysById: Record<number, string> = {
    ...(resolvedChannelKeysById ?? {}),
  }

  const channels = applyResolvedChannelKeys(
    searchResultItems,
    mergedResolvedChannelKeysById,
  )
  let urlBucket = findManagedSiteChannelsByBaseUrl({
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

  if (
    resolveHiddenKeys &&
    typeof service.fetchChannelSecretKey === "function" &&
    key?.trim()
  ) {
    const resolvedUrlChannel =
      urlBucket[0] ?? keyAssessment.channel ?? modelsAssessment.channel
    const recoverableCandidate = getRecoverableManagedSiteChannelCandidate({
      url: {
        channel: resolvedUrlChannel,
        candidateCount:
          urlBucket.length > 0 ? urlBucket.length : resolvedUrlChannel ? 1 : 0,
      },
      models: {
        channel: modelsAssessment.channel,
        reason: modelsAssessment.reason,
      },
    })

    if (
      recoverableCandidate?.id != null &&
      !recoverableCandidate.key?.trim() &&
      typeof mergedResolvedChannelKeysById[recoverableCandidate.id] !== "string"
    ) {
      try {
        mergedResolvedChannelKeysById[recoverableCandidate.id] =
          await fetchRecoverableCandidateSecretKey({
            service,
            managedConfig,
            channelId: recoverableCandidate.id,
          })

        const channelsWithResolvedKey = applyResolvedChannelKeys(
          searchResultItems,
          mergedResolvedChannelKeysById,
        )

        urlBucket = findManagedSiteChannelsByBaseUrl({
          channels: channelsWithResolvedKey,
          accountBaseUrl: searchBaseUrl,
        })
        keyAssessment = inspectManagedSiteChannelKeyMatch({
          channels: channelsWithResolvedKey,
          accountBaseUrl: searchBaseUrl,
          key,
        })
        modelsAssessment = inspectManagedSiteChannelModelsMatch({
          channels: channelsWithResolvedKey,
          accountBaseUrl: searchBaseUrl,
          models,
        })
      } catch (error) {
        if (!(error instanceof MatchResolutionUnresolvedError)) {
          throw error
        }
      }
    }
  }

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
