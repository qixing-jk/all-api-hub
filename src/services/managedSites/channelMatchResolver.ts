import {
  getRecoverableManagedSiteChannelCandidate,
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  MatchResolutionUnresolvedError,
  type ManagedSiteChannelMatchInspection,
  type ManagedSiteChannelMatchUnresolvedReason,
} from "~/services/managedSites/channelMatch"
import type { ManagedSiteService } from "~/services/managedSites/managedSiteService"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import {
  findManagedSiteChannelsByBaseUrl,
  findManagedSiteChannelsByBaseUrlAndModels,
  getManagedSiteChannelKeyComparisonMode,
  inspectManagedSiteChannelKeyMatch,
  inspectManagedSiteChannelModelsMatch,
  normalizeManagedSiteChannelBaseUrl,
} from "~/services/managedSites/utils/channelMatching"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type { ManagedSiteChannelListData } from "~/types/managedSite"

export type ManagedSiteChannelMatchService = Pick<
  ManagedSiteService,
  | "siteType"
  | "searchChannel"
  | "hydrateComparableChannelKeys"
  | "fetchChannelSecretKey"
>

export interface ManagedSiteChannelMatchRequestCache {
  searchResultsByBaseUrl: Map<
    string,
    Promise<ManagedSiteChannelListData | null>
  >
  channelSecretKeysById: Map<number, Promise<string>>
  resolvedChannelKeysById: Record<number, string>
}

export const createManagedSiteChannelMatchRequestCache =
  (): ManagedSiteChannelMatchRequestCache => ({
    searchResultsByBaseUrl: new Map(),
    channelSecretKeysById: new Map(),
    resolvedChannelKeysById: {},
  })

interface ResolveManagedSiteChannelMatchParams {
  service: ManagedSiteChannelMatchService
  managedConfig: ManagedSiteRuntimeConfigValue
  accountBaseUrl: string
  models: string[]
  key?: string
  resolvedChannelKeysById?: Record<number, string>
  resolveHiddenKeys?: boolean
  requestCache?: ManagedSiteChannelMatchRequestCache
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
  managedConfig: ManagedSiteRuntimeConfigValue
  channelId: number
  requestCache?: ManagedSiteChannelMatchRequestCache
}) => {
  try {
    const cachedSecretKeyPromise =
      params.requestCache?.channelSecretKeysById.get(params.channelId)

    if (cachedSecretKeyPromise) {
      return await cachedSecretKeyPromise
    }

    const secretKeyPromise = params.service.fetchChannelSecretKey!(
      params.managedConfig,
      params.channelId,
    )
    params.requestCache?.channelSecretKeysById.set(
      params.channelId,
      secretKeyPromise,
    )

    return await secretKeyPromise
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
    requestCache,
  } = params
  const searchBaseUrl = normalizeManagedSiteChannelBaseUrl(
    params.accountBaseUrl,
  )
  let unresolvedReason: ManagedSiteChannelMatchUnresolvedReason | undefined
  const keyComparisonMode = getManagedSiteChannelKeyComparisonMode(
    service.siteType,
  )

  let searchResultsPromise =
    requestCache?.searchResultsByBaseUrl.get(searchBaseUrl)

  if (!searchResultsPromise) {
    searchResultsPromise = service.searchChannel(managedConfig, searchBaseUrl)
    requestCache?.searchResultsByBaseUrl.set(
      searchBaseUrl,
      searchResultsPromise,
    )
  }

  const searchResults = await searchResultsPromise

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
        keyComparisonMode,
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
    ...(requestCache?.resolvedChannelKeysById ?? {}),
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
    keyComparisonMode,
  })
  let modelsAssessment = inspectManagedSiteChannelModelsMatch({
    channels,
    accountBaseUrl: searchBaseUrl,
    models,
  })

  const alignExactModelAssessmentWithMatchedKey = (
    assessmentChannels: typeof channels,
  ) => {
    if (!keyAssessment.matched || keyAssessment.channel?.id == null) {
      return
    }

    const exactModelChannels = findManagedSiteChannelsByBaseUrlAndModels({
      channels: assessmentChannels,
      accountBaseUrl: searchBaseUrl,
      models,
    })

    if (
      !exactModelChannels.some(
        (channel) => channel.id === keyAssessment.channel?.id,
      )
    ) {
      return
    }

    const keyedModelsAssessment = inspectManagedSiteChannelModelsMatch({
      channels: assessmentChannels,
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
      keyComparisonMode,
    })
    modelsAssessment = inspectManagedSiteChannelModelsMatch({
      channels: channelsWithResolvedKeys,
      accountBaseUrl: searchBaseUrl,
      models,
    })
    alignExactModelAssessmentWithMatchedKey(channelsWithResolvedKeys)

    return channelsWithResolvedKeys
  }

  const hasExactKeyAndModelMatch = () =>
    keyAssessment.matched &&
    modelsAssessment.matched &&
    modelsAssessment.reason ===
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT &&
    keyAssessment.channel?.id === modelsAssessment.channel?.id

  alignExactModelAssessmentWithMatchedKey(channels)

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
            requestCache,
          })
        if (requestCache) {
          requestCache.resolvedChannelKeysById[recoverableCandidate.id] =
            mergedResolvedChannelKeysById[recoverableCandidate.id]
        }
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
    !hasExactKeyAndModelMatch()
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
          managedConfig,
          recoverableCandidates,
        )

        for (const channel of hydratedCandidates) {
          if (hasUsableManagedSiteChannelKey(channel.key)) {
            mergedResolvedChannelKeysById[channel.id] = channel.key!.trim()
            if (requestCache) {
              requestCache.resolvedChannelKeysById[channel.id] =
                mergedResolvedChannelKeysById[channel.id]
            }
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
    ...(unresolvedReason && !hasExactKeyAndModelMatch()
      ? { unresolvedReason }
      : {}),
  }
}
