import {
  getRecoverableManagedSiteChannelCandidate,
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  MatchResolutionUnresolvedError,
  type ManagedSiteChannelMatchInspection,
  type ManagedSiteChannelMatchUnresolvedReason,
} from "~/services/managedSites/channelMatch"
import type {
  ManagedSiteConfig,
  ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import {
  findManagedSiteChannelsByBaseUrl,
  findManagedSiteChannelsByBaseUrlAndModels,
  inspectManagedSiteChannelKeyMatch,
  inspectManagedSiteChannelModelsMatch,
  normalizeManagedSiteChannelBaseUrl,
} from "~/services/managedSites/utils/channelMatching"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"

export type ManagedSiteChannelMatchService = Pick<
  ManagedSiteService,
  "searchChannel" | "hydrateComparableChannelKeys" | "fetchChannelSecretKey"
>

interface ResolveManagedSiteChannelMatchParams {
  service: ManagedSiteChannelMatchService
  managedConfig: ManagedSiteConfig
  accountBaseUrl: string
  models: string[]
  key?: string
  resolvedChannelKeysById?: Record<number, string>
  resolveHiddenKeys?: boolean
}

interface ManagedSiteChannelMatchResolution
  extends ManagedSiteChannelMatchInspection {
  resolvedChannelKeysById?: Record<number, string>
  unresolvedReason?: ManagedSiteChannelMatchUnresolvedReason
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
  service: ManagedSiteChannelMatchService
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
 * Resolves the strongest available managed-site channel match from local
 * assessments, hydrating recoverable candidate keys when local data is hidden.
 */
export async function resolveManagedSiteChannelMatch(
  params: ResolveManagedSiteChannelMatchParams,
): Promise<ManagedSiteChannelMatchResolution> {
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
  let unresolvedReason: ManagedSiteChannelMatchUnresolvedReason | undefined

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

  const refreshAssessmentsWithResolvedKeys = () => {
    const channelsWithResolvedKeys = applyResolvedChannelKeys(
      searchResultItems,
      mergedResolvedChannelKeysById,
    )

    urlBucket = findManagedSiteChannelsByBaseUrl({
      channels: channelsWithResolvedKeys,
      accountBaseUrl: searchBaseUrl,
    })
    keyAssessment = inspectManagedSiteChannelKeyMatch({
      channels: channelsWithResolvedKeys,
      accountBaseUrl: searchBaseUrl,
      key,
    })
    modelsAssessment = inspectManagedSiteChannelModelsMatch({
      channels: channelsWithResolvedKeys,
      accountBaseUrl: searchBaseUrl,
      models,
    })
    if (keyAssessment.matched && keyAssessment.channel) {
      const exactModelChannels = findManagedSiteChannelsByBaseUrlAndModels({
        channels: channelsWithResolvedKeys,
        accountBaseUrl: searchBaseUrl,
        models,
      })

      if (
        !exactModelChannels.some(
          (channel) => channel.id === keyAssessment.channel?.id,
        )
      ) {
        return channelsWithResolvedKeys
      }

      const keyedModelsAssessment = inspectManagedSiteChannelModelsMatch({
        channels: channelsWithResolvedKeys,
        accountBaseUrl: searchBaseUrl,
        models,
        exactChannel: keyAssessment.channel,
      })

      if (
        keyedModelsAssessment.matched &&
        keyedModelsAssessment.reason ===
          MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT
      ) {
        modelsAssessment = keyedModelsAssessment
      }
    }

    return channelsWithResolvedKeys
  }

  if (Object.keys(mergedResolvedChannelKeysById).length > 0) {
    refreshAssessmentsWithResolvedKeys()
  }

  if (
    resolveHiddenKeys &&
    typeof service.fetchChannelSecretKey === "function" &&
    key?.trim()
  ) {
    const recoverableUrlCandidates = urlBucket.filter(
      (channel) =>
        !hasUsableManagedSiteChannelKey(channel.key) &&
        typeof mergedResolvedChannelKeysById[channel.id] !== "string",
    )
    const resolvedUrlChannel =
      urlBucket.length === 1
        ? urlBucket[0]
        : keyAssessment.channel ?? modelsAssessment.channel
    const rankedRecoverableCandidate =
      getRecoverableManagedSiteChannelCandidate({
        url: {
          channel: resolvedUrlChannel,
          candidateCount:
            urlBucket.length > 0
              ? urlBucket.length
              : resolvedUrlChannel
                ? 1
                : 0,
        },
        models: {
          channel: modelsAssessment.channel,
          reason: modelsAssessment.reason,
        },
      })
    const recoverableCandidates = [
      ...recoverableUrlCandidates,
      ...(rankedRecoverableCandidate &&
      !recoverableUrlCandidates.some(
        (channel) => channel.id === rankedRecoverableCandidate.id,
      ) &&
      !hasUsableManagedSiteChannelKey(rankedRecoverableCandidate.key) &&
      typeof mergedResolvedChannelKeysById[rankedRecoverableCandidate.id] !==
        "string"
        ? [rankedRecoverableCandidate]
        : []),
    ]

    for (const recoverableCandidate of recoverableCandidates) {
      try {
        mergedResolvedChannelKeysById[recoverableCandidate.id] =
          await fetchRecoverableCandidateSecretKey({
            service,
            managedConfig,
            channelId: recoverableCandidate.id,
          })
      } catch (error) {
        if (!(error instanceof MatchResolutionUnresolvedError)) {
          throw error
        }
        unresolvedReason ??= error.reason
      }
    }

    if (recoverableCandidates.length > 0) {
      refreshAssessmentsWithResolvedKeys()
    }
  }

  if (
    typeof service.hydrateComparableChannelKeys === "function" &&
    key?.trim() &&
    !(
      keyAssessment.matched &&
      modelsAssessment.matched &&
      modelsAssessment.reason ===
        MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT &&
      keyAssessment.channel?.id === modelsAssessment.channel?.id
    )
  ) {
    const exactModelChannels = findManagedSiteChannelsByBaseUrlAndModels({
      channels: applyResolvedChannelKeys(
        searchResultItems,
        mergedResolvedChannelKeysById,
      ),
      accountBaseUrl: searchBaseUrl,
      models,
    })
    const recoverableExactModelCandidates = exactModelChannels.filter(
      (channel) =>
        !hasUsableManagedSiteChannelKey(channel.key) &&
        typeof mergedResolvedChannelKeysById[channel.id] !== "string",
    )
    const rankedRecoverableCandidate =
      getRecoverableManagedSiteChannelCandidate({
        url: {
          channel:
            urlBucket.length === 1
              ? urlBucket[0]
              : keyAssessment.channel ?? modelsAssessment.channel,
          candidateCount: urlBucket.length,
        },
        models: {
          channel: modelsAssessment.channel,
          reason: modelsAssessment.reason,
        },
      })
    const recoverableCandidates = [
      ...recoverableExactModelCandidates,
      ...(rankedRecoverableCandidate &&
      modelsAssessment.channel?.id === rankedRecoverableCandidate.id &&
      !recoverableExactModelCandidates.some(
        (channel) => channel.id === rankedRecoverableCandidate.id,
      ) &&
      !hasUsableManagedSiteChannelKey(rankedRecoverableCandidate.key)
        ? [rankedRecoverableCandidate]
        : []),
    ]

    if (recoverableCandidates.length > 0) {
      try {
        const hydratedCandidates = await service.hydrateComparableChannelKeys(
          managedConfig.baseUrl,
          managedConfig.token,
          managedConfig.userId,
          recoverableCandidates,
        )

        for (const channel of hydratedCandidates) {
          if (hasUsableManagedSiteChannelKey(channel.key)) {
            mergedResolvedChannelKeysById[channel.id] = channel.key!.trim()
          }
        }

        refreshAssessmentsWithResolvedKeys()
      } catch (error) {
        if (!(error instanceof MatchResolutionUnresolvedError)) {
          throw error
        }
        unresolvedReason ??= error.reason
      }
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
    ...(Object.keys(mergedResolvedChannelKeysById).length > 0
      ? { resolvedChannelKeysById: mergedResolvedChannelKeysById }
      : {}),
    ...(unresolvedReason ? { unresolvedReason } : {}),
  }
}
