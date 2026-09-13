import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  SharedRead,
  type ScheduledReadOptions,
} from "~/services/apiTransport/requestScheduling"
import {
  getRecoverableManagedSiteChannelCandidate,
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  MatchResolutionUnresolvedError,
  type ManagedSiteChannelMatchInspection,
  type ManagedSiteChannelMatchUnresolvedReason,
} from "~/services/managedSites/channelMatch"
import {
  areManagedResourceRefsEqual,
  assertManagedResourceRefForSite,
  getManagedResourceRefKey,
} from "~/services/managedSites/managedResourceIdentity"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import {
  findManagedSiteChannelsByBaseUrl,
  findManagedSiteChannelsByBaseUrlAndModels,
  getManagedSiteChannelKeyComparisonMode,
  inspectManagedSiteChannelKeyMatch,
  inspectManagedSiteChannelModelsMatch,
  normalizeManagedSiteChannelBaseUrl,
} from "~/services/managedSites/utils/channelMatching"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { ManagedResourceMatchList } from "~/types/managedResourceMatching"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"

export type ManagedSiteChannelMatchContext = Pick<
  ManagedSiteCapabilities,
  "siteType" | "matching"
>

export interface ManagedSiteChannelMatchRequestCache {
  searchResultsByTargetKey: Map<
    string,
    Promise<ManagedResourceMatchList | null>
  >
  channelSecretKeysByResourceKey: Map<string, Promise<string>>
  resolvedChannelKeysByResourceKey: Record<string, string>
}

// Only pending searches cross operation boundaries: a later import must see
// resources created or edited since the previous check completed.
const pendingSearches = new WeakMap<
  ManagedSiteChannelMatchContext["matching"],
  Map<string, SharedRead<ManagedResourceMatchList | null>>
>()

/** Shares a pending read only for the same adapter, config and search target. */
function getPendingSearch(
  managedSite: ManagedSiteChannelMatchContext,
  managedConfig: ManagedSiteRuntimeConfigValue,
  searchBaseUrl: string,
  options: ScheduledReadOptions,
): Promise<ManagedResourceMatchList | null> {
  let searches = pendingSearches.get(managedSite.matching)
  if (!searches) {
    searches = new Map()
    pendingSearches.set(managedSite.matching, searches)
  }
  const key = JSON.stringify([
    managedSite.siteType,
    Object.entries(managedConfig).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    searchBaseUrl,
  ])
  const existing = searches.get(key)
  if (existing && !existing.signal.aborted) return existing.read(options)
  const read = new SharedRead<ManagedResourceMatchList | null>(
    async (sharedOptions) => {
      try {
        return await managedSite.matching.search(
          managedConfig,
          searchBaseUrl,
          sharedOptions,
        )
      } finally {
        if (searches.get(key) === read) searches.delete(key)
      }
    },
  )
  searches.set(key, read)
  return read.read(options)
}

export const createManagedSiteChannelMatchRequestCache =
  (): ManagedSiteChannelMatchRequestCache => ({
    searchResultsByTargetKey: new Map(),
    channelSecretKeysByResourceKey: new Map(),
    resolvedChannelKeysByResourceKey: {},
  })

interface ResolveManagedSiteChannelMatchParams extends ScheduledReadOptions {
  managedSite: ManagedSiteChannelMatchContext
  managedConfig: ManagedSiteRuntimeConfigValue
  accountBaseUrl: string
  models: string[]
  key?: string
  resolvedChannelKeysByResourceKey?: Record<string, string>
  resolveHiddenKeys?: boolean
  hiddenKeyResourceRefs?: readonly ManagedResourceRef[]
  requestCache?: ManagedSiteChannelMatchRequestCache
  protectionBypassExecution?: ProtectionBypassExecution
}

interface ManagedSiteChannelMatchResolution
  extends ManagedSiteChannelMatchInspection {
  resolvedChannelKeysByResourceKey?: Record<string, string>
  unresolvedReason?: ManagedSiteChannelMatchUnresolvedReason
}

const applyResolvedChannelKeys = <
  T extends { ref: ManagedResourceRef; key?: string },
>(
  channels: T[],
  resolvedChannelKeysByResourceKey?: Record<string, string>,
) => {
  if (
    !resolvedChannelKeysByResourceKey ||
    Object.keys(resolvedChannelKeysByResourceKey).length === 0
  ) {
    return channels
  }

  return channels.map((channel) => {
    const resolvedKey =
      resolvedChannelKeysByResourceKey[getManagedResourceRefKey(channel.ref)]

    if (typeof resolvedKey !== "string") {
      return channel
    }

    return {
      ...channel,
      key: resolvedKey,
    }
  })
}

const fetchRecoverableCandidateSecretKey = async (
  params: ScheduledReadOptions & {
    managedSite: ManagedSiteChannelMatchContext
    managedConfig: ManagedSiteRuntimeConfigValue
    resourceRef: ManagedResourceRef
    requestCache?: ManagedSiteChannelMatchRequestCache
    protectionBypassExecution: ProtectionBypassExecution
  },
) => {
  assertManagedResourceRefForSite(params.resourceRef, {
    siteType: params.managedSite.siteType,
    config: params.managedConfig,
  })
  const resourceKey = getManagedResourceRefKey(params.resourceRef)
  try {
    const cachedSecretKeyPromise =
      params.requestCache?.channelSecretKeysByResourceKey.get(resourceKey)

    if (cachedSecretKeyPromise) {
      return await cachedSecretKeyPromise
    }

    const secretKeyPromise = params.managedSite.matching.fetchSecretKey!(
      params.managedConfig,
      params.resourceRef,
      {
        protectionBypassExecution: params.protectionBypassExecution,
        signal: params.signal,
        requestScheduling: params.requestScheduling,
      },
    )
    params.requestCache?.channelSecretKeysByResourceKey.set(
      resourceKey,
      secretKeyPromise,
    )
    secretKeyPromise.catch(() => {
      if (
        params.requestCache?.channelSecretKeysByResourceKey.get(resourceKey) ===
        secretKeyPromise
      ) {
        params.requestCache.channelSecretKeysByResourceKey.delete(resourceKey)
      }
    })

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
  params.signal?.throwIfAborted()
  const {
    managedSite,
    managedConfig,
    models,
    key,
    resolvedChannelKeysByResourceKey,
    resolveHiddenKeys = false,
    requestCache,
  } = params
  const searchBaseUrl = normalizeManagedSiteChannelBaseUrl(
    params.accountBaseUrl,
  )
  let unresolvedReason: ManagedSiteChannelMatchUnresolvedReason | undefined
  const keyComparisonMode = getManagedSiteChannelKeyComparisonMode(
    managedSite.siteType,
  )
  const target = { siteType: managedSite.siteType, config: managedConfig }
  for (const ref of params.hiddenKeyResourceRefs ?? []) {
    assertManagedResourceRefForSite(ref, target)
  }
  const searchCacheKey = JSON.stringify([
    managedSite.siteType,
    normalizeManagedUpstreamResourceScopeKey(managedConfig.baseUrl),
    searchBaseUrl,
  ])

  let searchResultsPromise =
    requestCache?.searchResultsByTargetKey.get(searchCacheKey)

  if (!searchResultsPromise) {
    const cache = requestCache
    searchResultsPromise = getPendingSearch(
      managedSite,
      managedConfig,
      searchBaseUrl,
      params,
    )
    cache?.searchResultsByTargetKey.set(searchCacheKey, searchResultsPromise)
    searchResultsPromise.catch(() => {
      if (
        cache &&
        cache.searchResultsByTargetKey.get(searchCacheKey) ===
          searchResultsPromise
      ) {
        cache.searchResultsByTargetKey.delete(searchCacheKey)
      }
    })
  }

  params.signal?.throwIfAborted()
  const searchResults = await searchResultsPromise
  params.signal?.throwIfAborted()

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
  try {
    for (const candidate of searchResultItems) {
      assertManagedResourceRefForSite(candidate.ref, target)
    }
  } catch (error) {
    requestCache?.searchResultsByTargetKey.delete(searchCacheKey)
    throw error
  }
  const availableKeys: Record<string, string> = {
    ...(requestCache?.resolvedChannelKeysByResourceKey ?? {}),
    ...(resolvedChannelKeysByResourceKey ?? {}),
  }
  const mergedResolvedChannelKeysByResourceKey: Record<string, string> = {}
  for (const candidate of searchResultItems) {
    const resourceKey = getManagedResourceRefKey(candidate.ref)
    if (typeof availableKeys[resourceKey] === "string") {
      mergedResolvedChannelKeysByResourceKey[resourceKey] =
        availableKeys[resourceKey]
    }
  }

  const channels = applyResolvedChannelKeys(
    searchResultItems,
    mergedResolvedChannelKeysByResourceKey,
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
    if (!keyAssessment.matched || !keyAssessment.channel) {
      return
    }

    const exactModelChannels = findManagedSiteChannelsByBaseUrlAndModels({
      channels: assessmentChannels,
      accountBaseUrl: searchBaseUrl,
      models,
    })

    if (
      !exactModelChannels.some((channel) =>
        areManagedResourceRefsEqual(channel.ref, keyAssessment.channel?.ref),
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
      mergedResolvedChannelKeysByResourceKey,
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
    areManagedResourceRefsEqual(
      keyAssessment.channel?.ref,
      modelsAssessment.channel?.ref,
    )

  alignExactModelAssessmentWithMatchedKey(channels)

  if (Object.keys(mergedResolvedChannelKeysByResourceKey).length > 0) {
    refreshAssessmentsWithResolvedKeys()
  }

  const attemptedSecretReads = new Set<string>()

  if (
    resolveHiddenKeys &&
    params.protectionBypassExecution &&
    typeof managedSite.matching.fetchSecretKey === "function" &&
    key?.trim()
  ) {
    const recoverableUrlCandidates = urlBucket.filter(
      (channel) =>
        !hasUsableManagedSiteChannelKey(channel.key) &&
        typeof mergedResolvedChannelKeysByResourceKey[
          getManagedResourceRefKey(channel.ref)
        ] !== "string",
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
      !recoverableUrlCandidates.some((channel) =>
        areManagedResourceRefsEqual(
          channel.ref,
          rankedRecoverableCandidate.ref,
        ),
      ) &&
      !hasUsableManagedSiteChannelKey(rankedRecoverableCandidate.key) &&
      typeof mergedResolvedChannelKeysByResourceKey[
        getManagedResourceRefKey(rankedRecoverableCandidate.ref)
      ] !== "string"
        ? [rankedRecoverableCandidate]
        : []),
    ].filter(
      (channel) =>
        !params.hiddenKeyResourceRefs ||
        params.hiddenKeyResourceRefs.some((ref) =>
          areManagedResourceRefsEqual(ref, channel.ref),
        ),
    )

    for (const recoverableCandidate of recoverableCandidates) {
      params.signal?.throwIfAborted()
      attemptedSecretReads.add(
        getManagedResourceRefKey(recoverableCandidate.ref),
      )
      try {
        mergedResolvedChannelKeysByResourceKey[
          getManagedResourceRefKey(recoverableCandidate.ref)
        ] = await fetchRecoverableCandidateSecretKey({
          managedSite,
          managedConfig,
          resourceRef: recoverableCandidate.ref,
          requestCache,
          protectionBypassExecution: params.protectionBypassExecution,
          signal: params.signal,
          requestScheduling: params.requestScheduling,
        })
        if (requestCache) {
          requestCache.resolvedChannelKeysByResourceKey[
            getManagedResourceRefKey(recoverableCandidate.ref)
          ] =
            mergedResolvedChannelKeysByResourceKey[
              getManagedResourceRefKey(recoverableCandidate.ref)
            ]
        }
      } catch (error) {
        params.signal?.throwIfAborted()
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
    params.protectionBypassExecution &&
    typeof managedSite.matching.hydrateComparableKeys === "function" &&
    key?.trim() &&
    !hasExactKeyAndModelMatch()
  ) {
    const exactModelChannels = findManagedSiteChannelsByBaseUrlAndModels({
      channels: applyResolvedChannelKeys(
        searchResultItems,
        mergedResolvedChannelKeysByResourceKey,
      ),
      accountBaseUrl: searchBaseUrl,
      models,
    })
    const recoverableExactModelCandidates = exactModelChannels.filter(
      (channel) =>
        !hasUsableManagedSiteChannelKey(channel.key) &&
        typeof mergedResolvedChannelKeysByResourceKey[
          getManagedResourceRefKey(channel.ref)
        ] !== "string",
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
      areManagedResourceRefsEqual(
        modelsAssessment.channel?.ref,
        rankedRecoverableCandidate.ref,
      ) &&
      !recoverableExactModelCandidates.some((channel) =>
        areManagedResourceRefsEqual(
          channel.ref,
          rankedRecoverableCandidate.ref,
        ),
      ) &&
      !hasUsableManagedSiteChannelKey(rankedRecoverableCandidate.key)
        ? [rankedRecoverableCandidate]
        : []),
    ].filter(
      (channel) =>
        !attemptedSecretReads.has(getManagedResourceRefKey(channel.ref)) &&
        typeof mergedResolvedChannelKeysByResourceKey[
          getManagedResourceRefKey(channel.ref)
        ] !== "string" &&
        (!params.hiddenKeyResourceRefs ||
          params.hiddenKeyResourceRefs.some((ref) =>
            areManagedResourceRefsEqual(ref, channel.ref),
          )),
    )

    if (recoverableCandidates.length > 0) {
      try {
        const hydratedCandidates =
          await managedSite.matching.hydrateComparableKeys(
            managedConfig,
            recoverableCandidates,
            {
              protectionBypassExecution: params.protectionBypassExecution,
              signal: params.signal,
              requestScheduling: params.requestScheduling,
            },
          )

        const requestedKeys = new Set(
          recoverableCandidates.map((candidate) =>
            getManagedResourceRefKey(candidate.ref),
          ),
        )
        for (const channel of hydratedCandidates) {
          assertManagedResourceRefForSite(channel.ref, target)
          if (!requestedKeys.has(getManagedResourceRefKey(channel.ref))) {
            throw new ManagedResourceError({
              code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
            })
          }
        }

        for (const channel of hydratedCandidates) {
          if (hasUsableManagedSiteChannelKey(channel.key)) {
            mergedResolvedChannelKeysByResourceKey[
              getManagedResourceRefKey(channel.ref)
            ] = channel.key!.trim()
            if (requestCache) {
              requestCache.resolvedChannelKeysByResourceKey[
                getManagedResourceRefKey(channel.ref)
              ] =
                mergedResolvedChannelKeysByResourceKey[
                  getManagedResourceRefKey(channel.ref)
                ]
            }
          }
        }

        refreshAssessmentsWithResolvedKeys()
      } catch (error) {
        params.signal?.throwIfAborted()
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
    ...(Object.keys(mergedResolvedChannelKeysByResourceKey).length > 0
      ? {
          resolvedChannelKeysByResourceKey:
            mergedResolvedChannelKeysByResourceKey,
        }
      : {}),
    ...(unresolvedReason && !hasExactKeyAndModelMatch()
      ? { unresolvedReason }
      : {}),
  }
}
