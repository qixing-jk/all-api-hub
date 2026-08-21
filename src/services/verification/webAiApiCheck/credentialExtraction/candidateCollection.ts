import {
  API_CHECK_CANDIDATE_CONFIDENCES,
  API_CHECK_CANDIDATE_REASONS,
  type ApiCheckCandidateConfidence,
  type ApiCheckCandidateReason,
  type ApiCheckExtractionSummary,
  type InternalApiCheckCandidate,
} from "./candidateContract"

const CONFIDENCE_RANK: Record<ApiCheckCandidateConfidence, number> = {
  [API_CHECK_CANDIDATE_CONFIDENCES.STANDARD]: 0,
  [API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_HIGH]: 1,
  [API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_MEDIUM]: 2,
}

/**
 * Remove common wrapping punctuation for tokens extracted from free-form text.
 */
export function trimWrappingPunctuation(value: string): string {
  return (value || "")
    .trim()
    .replace(/^\*+|\*+$/g, "")
    .replace(/^[('"`[{<]+/, "")
    .replace(/[)'"`}\]>.,;]+$/, "")
}

/**
 * Merge reason tags without changing their first-seen ordering.
 */
export function mergeReasons(
  current: ApiCheckCandidateReason[],
  next: ApiCheckCandidateReason[],
) {
  const merged = [...current]
  for (const reason of next) {
    if (!merged.includes(reason)) merged.push(reason)
  }
  return merged
}

/**
 * Sort base URL candidates from most suitable best-match choice to least suitable.
 */
export function compareCandidates(
  a: InternalApiCheckCandidate,
  b: InternalApiCheckCandidate,
) {
  const confidenceDelta =
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
  if (confidenceDelta !== 0) return confidenceDelta

  const labeledDelta =
    Number(b.reasons.includes(API_CHECK_CANDIDATE_REASONS.LABELED)) -
    Number(a.reasons.includes(API_CHECK_CANDIDATE_REASONS.LABELED))
  if (labeledDelta !== 0) return labeledDelta

  const knownPrefixDelta =
    Number(b.reasons.includes(API_CHECK_CANDIDATE_REASONS.KNOWN_PREFIX)) -
    Number(a.reasons.includes(API_CHECK_CANDIDATE_REASONS.KNOWN_PREFIX))
  if (knownPrefixDelta !== 0) return knownPrefixDelta

  const cleanupDelta = Number(!!b.cleanupApplied) - Number(!!a.cleanupApplied)
  if (cleanupDelta !== 0) return cleanupDelta

  return a.insertionOrder - b.insertionOrder
}

/**
 * Rank API key candidates by how likely the final value is to be usable.
 */
function getApiKeyUsefulnessRank(candidate: InternalApiCheckCandidate) {
  if (
    candidate.reasons.includes(
      API_CHECK_CANDIDATE_REASONS.BASE64_ENCODED_SOURCE,
    )
  )
    return -1
  if (candidate.reasons.includes(API_CHECK_CANDIDATE_REASONS.KNOWN_PREFIX))
    return 4
  if (
    candidate.reasons.includes(API_CHECK_CANDIDATE_REASONS.UNKNOWN_SHORT_PREFIX)
  )
    return 3
  if (
    candidate.reasons.includes(
      API_CHECK_CANDIDATE_REASONS.UNKNOWN_LONG_PREFIX,
    ) ||
    candidate.reasons.includes(API_CHECK_CANDIDATE_REASONS.MULTI_SEGMENT)
  ) {
    return 2
  }
  if (
    candidate.reasons.includes(
      API_CHECK_CANDIDATE_REASONS.UNSEPARATED_LONG_TOKEN,
    )
  )
    return 1
  return 0
}

/**
 * Sort API key candidates by final key-likeness before source hints.
 */
export function compareApiKeyCandidates(
  a: InternalApiCheckCandidate,
  b: InternalApiCheckCandidate,
) {
  const usefulnessDelta =
    getApiKeyUsefulnessRank(b) - getApiKeyUsefulnessRank(a)
  if (usefulnessDelta !== 0) return usefulnessDelta

  const labeledDelta =
    Number(b.reasons.includes(API_CHECK_CANDIDATE_REASONS.LABELED)) -
    Number(a.reasons.includes(API_CHECK_CANDIDATE_REASONS.LABELED))
  if (labeledDelta !== 0) return labeledDelta

  const authorizationHeaderDelta =
    Number(
      b.reasons.includes(API_CHECK_CANDIDATE_REASONS.AUTHORIZATION_HEADER),
    ) -
    Number(a.reasons.includes(API_CHECK_CANDIDATE_REASONS.AUTHORIZATION_HEADER))
  if (authorizationHeaderDelta !== 0) return authorizationHeaderDelta

  const cleanupDelta = Number(!!b.cleanupApplied) - Number(!!a.cleanupApplied)
  if (cleanupDelta !== 0) return cleanupDelta

  return a.insertionOrder - b.insertionOrder
}

/**
 * Insert a structured candidate or merge it into an existing value match.
 */
export function pushCandidate(
  list: InternalApiCheckCandidate[],
  candidate: InternalApiCheckCandidate,
) {
  if (!candidate.value) return
  const existing = list.find((item) => item.value === candidate.value)
  if (existing) {
    existing.reasons = mergeReasons(existing.reasons, candidate.reasons)
    if (candidate.cleanupApplied) {
      existing.cleanupApplied = true
    }
    existing.autoPromptEligible =
      existing.autoPromptEligible || candidate.autoPromptEligible
    if (
      CONFIDENCE_RANK[candidate.confidence] <
      CONFIDENCE_RANK[existing.confidence]
    ) {
      existing.confidence = candidate.confidence
    }
    return
  }
  list.push(candidate)
}

/**
 * Drop internal ranking data before exposing structured candidates.
 */
export function toPublicCandidate(candidate: InternalApiCheckCandidate) {
  const { insertionOrder: _insertionOrder, ...publicCandidate } = candidate
  return publicCandidate
}

/**
 * Build aggregate flags for compatibility and later enhanced extraction flows.
 */
export function buildSummary(params: {
  baseUrls: InternalApiCheckCandidate[]
  apiKeys: InternalApiCheckCandidate[]
  selectedBaseUrl?: InternalApiCheckCandidate
  selectedApiKey?: InternalApiCheckCandidate
}): ApiCheckExtractionSummary {
  const hasEnhancedBaseUrl = params.baseUrls.some(
    (candidate) =>
      candidate.confidence !== API_CHECK_CANDIDATE_CONFIDENCES.STANDARD,
  )
  const hasEnhancedApiKey = params.apiKeys.some(
    (candidate) =>
      candidate.confidence !== API_CHECK_CANDIDATE_CONFIDENCES.STANDARD,
  )
  const hasCleanup = params.apiKeys.some(
    (candidate) => candidate.cleanupApplied,
  )
  const selectedBaseUrlUsesEnhanced =
    !!params.selectedBaseUrl &&
    params.selectedBaseUrl.confidence !==
      API_CHECK_CANDIDATE_CONFIDENCES.STANDARD
  const selectedApiKeyUsesEnhanced =
    !!params.selectedApiKey &&
    params.selectedApiKey.confidence !==
      API_CHECK_CANDIDATE_CONFIDENCES.STANDARD
  const usesEnhancedResult =
    selectedBaseUrlUsesEnhanced ||
    selectedApiKeyUsesEnhanced ||
    !!params.selectedApiKey?.cleanupApplied

  const autoPromptEligible =
    !!params.selectedBaseUrl?.autoPromptEligible &&
    !!params.selectedApiKey?.autoPromptEligible &&
    !usesEnhancedResult

  const hasBaseUrlForEnhanced = !!params.selectedBaseUrl
  const selectedKeyAllowsAuto =
    !!params.selectedApiKey?.autoPromptEligible ||
    (!!params.selectedApiKey &&
      hasBaseUrlForEnhanced &&
      !params.selectedApiKey.reasons.includes(
        API_CHECK_CANDIDATE_REASONS.UNSEPARATED_LONG_TOKEN,
      ))

  const enhancedAutoPromptEligible =
    !!params.selectedBaseUrl &&
    !!params.selectedApiKey &&
    usesEnhancedResult &&
    !!params.selectedBaseUrl.autoPromptEligible &&
    selectedKeyAllowsAuto

  return {
    hasEnhancedBaseUrl,
    hasEnhancedApiKey,
    hasCleanup,
    usesEnhancedResult,
    autoPromptEligible,
    enhancedAutoPromptEligible,
  }
}
