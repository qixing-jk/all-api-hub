import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MATCH_LEVELS,
  MANAGED_SITE_CHANNEL_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODEL_SIMILARITY_THRESHOLD,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  type ManagedSiteChannelKeyAssessment,
  type ManagedSiteChannelMatchResult,
  type ManagedSiteChannelModelsAssessment,
} from "~/services/managedSites/channelMatch"
import { normalizeOpenAiFamilyBaseUrl } from "~/services/verification/webAiApiCheck/extractCredentials"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { isArraysEqual } from "~/utils"
import { normalizeList, parseDelimitedList } from "~/utils/core/string"

interface FindManagedSiteChannelByComparableInputsParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
  models: string[]
  key?: string
}

interface FindManagedSiteChannelByBaseUrlParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
}

interface FindManagedSiteChannelsByBaseUrlParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
}

interface FindManagedSiteChannelsByBaseUrlAndModelsParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
  models: string[]
}

interface FindBestManagedSiteChannelMatchParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
  models: string[]
}

interface InspectManagedSiteChannelKeyMatchParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
  key?: string
  exactChannel?: ManagedSiteChannel | null
}

interface InspectManagedSiteChannelModelsMatchParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
  models: string[]
  exactChannel?: ManagedSiteChannel | null
}

interface RankedManagedSiteChannelCandidate {
  channel: ManagedSiteChannel
  reason:
    | typeof MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_EXACT
    | typeof MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_CONTAINED
    | typeof MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_SIMILAR
  similarityScore: number
  lengthDelta: number
}

const MODEL_MATCH_REASON_PRIORITY: Record<
  RankedManagedSiteChannelCandidate["reason"],
  number
> = {
  [MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_EXACT]: 3,
  [MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_CONTAINED]: 2,
  [MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_SIMILAR]: 1,
}

const toNormalizedModelList = (models: string[] | string): string[] =>
  normalizeList(Array.isArray(models) ? models : parseDelimitedList(models))

const toChannelKeyCandidates = (channel: ManagedSiteChannel): string[] =>
  (channel.key ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)

const isSubset = (subset: string[], superset: string[]) =>
  subset.every((item) => superset.includes(item))

const getModelSimilarityScore = (left: string[], right: string[]): number => {
  if (left.length === 0 || right.length === 0) {
    return 0
  }

  const intersectionSize = left.filter((item) => right.includes(item)).length
  const unionSize = new Set([...left, ...right]).size

  return unionSize === 0 ? 0 : intersectionSize / unionSize
}

const pickBetterCandidate = (
  current: RankedManagedSiteChannelCandidate | null,
  candidate: RankedManagedSiteChannelCandidate,
) => {
  if (!current) {
    return candidate
  }

  const currentPriority = MODEL_MATCH_REASON_PRIORITY[current.reason]
  const candidatePriority = MODEL_MATCH_REASON_PRIORITY[candidate.reason]

  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority ? candidate : current
  }

  if (candidate.similarityScore !== current.similarityScore) {
    return candidate.similarityScore > current.similarityScore
      ? candidate
      : current
  }

  if (candidate.lengthDelta !== current.lengthDelta) {
    return candidate.lengthDelta < current.lengthDelta ? candidate : current
  }

  return current
}

/**
 *
 */
export function normalizeManagedSiteChannelBaseUrl(baseUrl: string): string {
  return normalizeOpenAiFamilyBaseUrl(baseUrl) ?? baseUrl.trim()
}

/**
 * Filters managed-site channels by normalized base URL.
 */
export function findManagedSiteChannelsByBaseUrl(
  params: FindManagedSiteChannelsByBaseUrlParams,
): ManagedSiteChannel[] {
  const normalizedAccountBaseUrl = normalizeManagedSiteChannelBaseUrl(
    params.accountBaseUrl,
  )

  return params.channels.filter(
    (channel) =>
      normalizeManagedSiteChannelBaseUrl(channel.base_url) ===
      normalizedAccountBaseUrl,
  )
}

/**
 * Filters managed-site channels by normalized base URL and models.
 */
export function findManagedSiteChannelsByBaseUrlAndModels(
  params: FindManagedSiteChannelsByBaseUrlAndModelsParams,
): ManagedSiteChannel[] {
  const { accountBaseUrl, models } = params
  const normalizedDesiredModels = normalizeList(models)
  const urlBucket = findManagedSiteChannelsByBaseUrl({
    channels: params.channels,
    accountBaseUrl,
  })

  return urlBucket.filter((channel) => {
    const normalizedChannelModels = normalizeList(
      parseDelimitedList(channel.models),
    )

    return isArraysEqual(normalizedChannelModels, normalizedDesiredModels)
  })
}

/**
 * Finds a managed-site channel using the same comparable inputs used by the
 * existing import-time duplicate checks.
 */
export function findManagedSiteChannelByComparableInputs(
  params: FindManagedSiteChannelByComparableInputsParams,
): ManagedSiteChannel | null {
  const { channels, accountBaseUrl, models, key } = params
  const normalizedDesiredKey = (key ?? "").trim()
  const shouldMatchKey = normalizedDesiredKey.length > 0
  const comparableChannels = findManagedSiteChannelsByBaseUrlAndModels({
    channels,
    accountBaseUrl,
    models,
  })

  return (
    comparableChannels.find((channel) => {
      if (!shouldMatchKey) {
        return true
      }

      const candidates = (channel.key ?? "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)

      return candidates.includes(normalizedDesiredKey)
    }) ?? null
  )
}

/**
 * Finds a managed-site channel by normalized base URL only.
 */
export function findManagedSiteChannelByBaseUrl(
  params: FindManagedSiteChannelByBaseUrlParams,
): ManagedSiteChannel | null {
  return (
    findManagedSiteChannelsByBaseUrl({
      channels: params.channels,
      accountBaseUrl: params.accountBaseUrl,
    })[0] ?? null
  )
}

/**
 * Inspects whether any channel under the normalized URL bucket can be matched
 * by comparable key material.
 */
export function inspectManagedSiteChannelKeyMatch(
  params: InspectManagedSiteChannelKeyMatchParams,
): ManagedSiteChannelKeyAssessment {
  const normalizedDesiredKey = (params.key ?? "").trim()

  if (!normalizedDesiredKey) {
    return {
      comparable: false,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_KEY_PROVIDED,
      channel: null,
    }
  }

  if (params.exactChannel) {
    return {
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: params.exactChannel,
    }
  }

  const urlBucket = findManagedSiteChannelsByBaseUrl({
    channels: params.channels,
    accountBaseUrl: params.accountBaseUrl,
  })

  if (urlBucket.length === 0) {
    return {
      comparable: false,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
      channel: null,
    }
  }

  const matchedChannel =
    urlBucket.find((channel) =>
      toChannelKeyCandidates(channel).includes(normalizedDesiredKey),
    ) ?? null

  if (matchedChannel) {
    return {
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: matchedChannel,
    }
  }

  const hasComparableChannelKey = urlBucket.some(
    (channel) => toChannelKeyCandidates(channel).length > 0,
  )

  if (!hasComparableChannelKey) {
    return {
      comparable: false,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
      channel: null,
    }
  }

  return {
    comparable: true,
    matched: false,
    reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_MATCH,
    channel: null,
  }
}

/**
 * Inspects the strongest model-based result inside the normalized URL bucket.
 */
export function inspectManagedSiteChannelModelsMatch(
  params: InspectManagedSiteChannelModelsMatchParams,
): ManagedSiteChannelModelsAssessment {
  const normalizedDesiredModels = toNormalizedModelList(params.models)

  if (normalizedDesiredModels.length === 0) {
    return {
      comparable: false,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED,
      channel: null,
    }
  }

  if (params.exactChannel) {
    return {
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
      channel: params.exactChannel,
      similarityScore: 1,
    }
  }

  const bestMatch = findBestManagedSiteChannelMatch({
    channels: params.channels,
    accountBaseUrl: params.accountBaseUrl,
    models: normalizedDesiredModels,
  })

  if (bestMatch.level === MANAGED_SITE_CHANNEL_MATCH_LEVELS.NONE) {
    return {
      comparable: false,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE,
      channel: null,
    }
  }

  if (bestMatch.level === MANAGED_SITE_CHANNEL_MATCH_LEVELS.FUZZY) {
    return {
      comparable: true,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
      channel: null,
    }
  }

  const modelsReason = (() => {
    switch (bestMatch.reason) {
      case MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_EXACT:
        return MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT
      case MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_CONTAINED:
        return MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED
      case MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_SIMILAR:
        return MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR
      default:
        return MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH
    }
  })()

  return {
    comparable: true,
    matched: true,
    reason: modelsReason,
    channel: bestMatch.channel,
    similarityScore: bestMatch.similarityScore,
  }
}

/**
 * Finds the strongest ranked channel match within a normalized URL bucket.
 */
export function findBestManagedSiteChannelMatch(
  params: FindBestManagedSiteChannelMatchParams,
): ManagedSiteChannelMatchResult {
  const { channels, accountBaseUrl, models } = params
  const normalizedAccountBaseUrl =
    normalizeManagedSiteChannelBaseUrl(accountBaseUrl)
  const normalizedDesiredModels = toNormalizedModelList(models)
  const urlBucket = channels.filter(
    (channel) =>
      normalizeManagedSiteChannelBaseUrl(channel.base_url) ===
      normalizedAccountBaseUrl,
  )

  if (urlBucket.length === 0) {
    return {
      level: MANAGED_SITE_CHANNEL_MATCH_LEVELS.NONE,
      reason: MANAGED_SITE_CHANNEL_MATCH_REASONS.UNRESOLVED,
      channel: null,
    }
  }

  let bestSecondaryMatch: RankedManagedSiteChannelCandidate | null = null

  for (const channel of urlBucket) {
    const normalizedChannelModels = toNormalizedModelList(channel.models)

    if (
      normalizedDesiredModels.length === 0 ||
      normalizedChannelModels.length === 0
    ) {
      continue
    }

    if (isArraysEqual(normalizedChannelModels, normalizedDesiredModels)) {
      bestSecondaryMatch = pickBetterCandidate(bestSecondaryMatch, {
        channel,
        reason: MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_EXACT,
        similarityScore: 1,
        lengthDelta: 0,
      })
      continue
    }

    if (
      isSubset(normalizedDesiredModels, normalizedChannelModels) ||
      isSubset(normalizedChannelModels, normalizedDesiredModels)
    ) {
      bestSecondaryMatch = pickBetterCandidate(bestSecondaryMatch, {
        channel,
        reason: MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_CONTAINED,
        similarityScore: getModelSimilarityScore(
          normalizedChannelModels,
          normalizedDesiredModels,
        ),
        lengthDelta: Math.abs(
          normalizedChannelModels.length - normalizedDesiredModels.length,
        ),
      })
      continue
    }

    const similarityScore = getModelSimilarityScore(
      normalizedChannelModels,
      normalizedDesiredModels,
    )

    if (similarityScore >= MANAGED_SITE_CHANNEL_MODEL_SIMILARITY_THRESHOLD) {
      bestSecondaryMatch = pickBetterCandidate(bestSecondaryMatch, {
        channel,
        reason: MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_SIMILAR,
        similarityScore,
        lengthDelta: Math.abs(
          normalizedChannelModels.length - normalizedDesiredModels.length,
        ),
      })
    }
  }

  if (bestSecondaryMatch) {
    return {
      level: MANAGED_SITE_CHANNEL_MATCH_LEVELS.SECONDARY,
      reason: bestSecondaryMatch.reason,
      channel: bestSecondaryMatch.channel,
      similarityScore: bestSecondaryMatch.similarityScore,
    }
  }

  return {
    level: MANAGED_SITE_CHANNEL_MATCH_LEVELS.FUZZY,
    reason: MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_ONLY,
    channel: urlBucket[0] ?? null,
  }
}
