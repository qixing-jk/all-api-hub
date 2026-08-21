import {
  applyCustomApiKeyCleanupPatterns,
  classifyApiKeyCandidate,
  createApiKeyExtractionPatterns,
  decodeBase64ApiKeyCandidateLayers,
  isApiKeyFallbackCandidate,
} from "./apiKeyRules"
import {
  compareApiKeyCandidates,
  mergeReasons,
  pushCandidate,
  trimWrappingPunctuation,
} from "./candidateCollection"
import {
  API_CHECK_CANDIDATE_CONFIDENCES,
  API_CHECK_CANDIDATE_KINDS,
  API_CHECK_CANDIDATE_REASONS,
  type ApiCheckCandidateReason,
  type ApiCheckExtractionOptions,
  type InternalApiCheckCandidate,
} from "./candidateContract"

/**
 * Collect and rank API key candidates from free-form text.
 */
export function extractApiKeyCandidates(
  rawInput: string,
  options: ApiCheckExtractionOptions,
): InternalApiCheckCandidate[] {
  const cleanedApiKeyInput = applyCustomApiKeyCleanupPatterns(
    rawInput,
    options.apiKeyCleanupPatterns,
  )
  const apiKeyInput = cleanedApiKeyInput.value
  const candidates: InternalApiCheckCandidate[] = []
  let insertionOrder = 0

  const pushClassifiedApiKeyCandidate = (
    candidateValue: string,
    candidateReasons: ApiCheckCandidateReason[],
    cleanupApplied = false,
  ) => {
    const classified = classifyApiKeyCandidate(candidateValue)
    if (!classified) return false
    pushCandidate(candidates, {
      ...classified,
      kind: API_CHECK_CANDIDATE_KINDS.API_KEY,
      reasons: mergeReasons(candidateReasons, classified.reasons),
      cleanupApplied:
        cleanedApiKeyInput.cleanupApplied ||
        cleanupApplied ||
        classified.cleanupApplied,
      insertionOrder,
    })
    insertionOrder += 1
    return true
  }

  const pushBase64EncodedSourceCandidate = (
    candidateValue: string,
    candidateReasons: ApiCheckCandidateReason[],
    cleanupApplied = false,
  ) => {
    const sourceValue = trimWrappingPunctuation(candidateValue)
    const sourceCleanupApplied =
      cleanedApiKeyInput.cleanupApplied ||
      cleanupApplied ||
      sourceValue !== candidateValue ||
      undefined
    pushCandidate(candidates, {
      value: sourceValue,
      kind: API_CHECK_CANDIDATE_KINDS.API_KEY,
      confidence: API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_MEDIUM,
      reasons: mergeReasons(candidateReasons, [
        API_CHECK_CANDIDATE_REASONS.BASE64_ENCODED_SOURCE,
      ]),
      cleanupApplied: sourceCleanupApplied,
      autoPromptEligible: false,
      insertionOrder,
    })
    insertionOrder += 1
  }

  const pushDecodedOrClassifiedApiKeyCandidate = (
    candidateValue: string,
    candidateReasons: ApiCheckCandidateReason[],
    cleanupApplied = false,
  ) => {
    const decodedLayers = decodeBase64ApiKeyCandidateLayers(candidateValue)
    let pushedDecoded = false
    for (const decoded of decodedLayers.reverse()) {
      if (
        pushClassifiedApiKeyCandidate(
          decoded,
          mergeReasons(candidateReasons, [
            API_CHECK_CANDIDATE_REASONS.BASE64_DECODED,
          ]),
          true,
        )
      ) {
        pushedDecoded = true
        break
      }
    }

    if (pushedDecoded) {
      pushBase64EncodedSourceCandidate(
        candidateValue,
        candidateReasons,
        cleanupApplied,
      )
      return true
    }

    return pushClassifiedApiKeyCandidate(
      candidateValue,
      candidateReasons,
      cleanupApplied,
    )
  }

  const pushApiKeyCandidate = (
    value: string | null,
    reasons: ApiCheckCandidateReason[],
  ) => {
    if (!value) return
    const cleanedByCustomPatterns = applyCustomApiKeyCleanupPatterns(
      value,
      options.apiKeyCleanupPatterns,
    )
    const candidateValue = cleanedByCustomPatterns.value
    const candidateReasons =
      cleanedApiKeyInput.cleanupApplied ||
      cleanedByCustomPatterns.cleanupApplied
        ? mergeReasons(reasons, [
            API_CHECK_CANDIDATE_REASONS.CUSTOM_REGEX_REMOVED,
          ])
        : reasons

    if (
      pushDecodedOrClassifiedApiKeyCandidate(
        candidateValue,
        candidateReasons,
        cleanedByCustomPatterns.cleanupApplied,
      )
    )
      return
    if (!isApiKeyFallbackCandidate(candidateValue)) return
    const fallbackCandidate: InternalApiCheckCandidate = {
      value: candidateValue,
      kind: API_CHECK_CANDIDATE_KINDS.API_KEY,
      confidence: API_CHECK_CANDIDATE_CONFIDENCES.STANDARD,
      reasons: candidateReasons,
      autoPromptEligible: true,
      insertionOrder,
    }
    if (
      cleanedApiKeyInput.cleanupApplied ||
      cleanedByCustomPatterns.cleanupApplied
    ) {
      fallbackCandidate.cleanupApplied = true
    }
    pushCandidate(candidates, fallbackCandidate)
    insertionOrder += 1
  }

  const patterns = createApiKeyExtractionPatterns()

  for (const match of apiKeyInput.matchAll(patterns.authorizationHeader)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw)
      pushApiKeyCandidate(raw, [
        API_CHECK_CANDIDATE_REASONS.AUTHORIZATION_HEADER,
        API_CHECK_CANDIDATE_REASONS.KNOWN_PREFIX,
      ])
  }

  for (const match of apiKeyInput.matchAll(patterns.labeled)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw) pushApiKeyCandidate(raw, [API_CHECK_CANDIDATE_REASONS.LABELED])
  }

  for (const match of apiKeyInput.matchAll(patterns.labeledSeparated)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw) pushApiKeyCandidate(raw, [API_CHECK_CANDIDATE_REASONS.LABELED])
  }

  for (const match of apiKeyInput.matchAll(patterns.separatedKnown)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw)
      pushApiKeyCandidate(raw, [API_CHECK_CANDIDATE_REASONS.KNOWN_PREFIX])
  }

  for (const match of apiKeyInput.matchAll(patterns.knownToken)) {
    const raw = trimWrappingPunctuation(match[0] ?? "")
    if (raw)
      pushApiKeyCandidate(raw, [API_CHECK_CANDIDATE_REASONS.KNOWN_PREFIX])
  }

  for (const match of apiKeyInput.matchAll(patterns.enhancedWindow)) {
    const candidateReasons: ApiCheckCandidateReason[] =
      cleanedApiKeyInput.cleanupApplied
        ? [API_CHECK_CANDIDATE_REASONS.CUSTOM_REGEX_REMOVED]
        : []
    pushDecodedOrClassifiedApiKeyCandidate(
      match[1] ?? "",
      candidateReasons,
      cleanedApiKeyInput.cleanupApplied,
    )
  }

  candidates.sort(compareApiKeyCandidates)
  return candidates
}
