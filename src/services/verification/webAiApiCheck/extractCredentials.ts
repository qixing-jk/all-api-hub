import { extractApiKeyCandidates } from "./credentialExtraction/apiKeyCandidates"
import { extractBaseUrlCandidates } from "./credentialExtraction/baseUrlCandidates"
import {
  buildSummary,
  toPublicCandidate,
} from "./credentialExtraction/candidateCollection"
import type {
  ApiCheckExtractionOptions,
  ApiCheckExtractionResult,
} from "./credentialExtraction/candidateContract"

/**
 * Extract best-effort baseUrl + apiKey candidates from a free-form text blob.
 *
 * Supported patterns include:
 * - JSON / env var: `baseUrl=https://...`, `"baseURL": "https://..."`
 * - Header / curl: `Authorization: Bearer sk-...`
 * - Plain tokens: `sk-...`
 */
export function extractApiCheckCredentialsFromText(
  text: string,
  options: ApiCheckExtractionOptions = {},
): ApiCheckExtractionResult {
  const rawInput = (text ?? "").trim()
  if (!rawInput) {
    return {
      baseUrlCandidates: [],
      apiKeyCandidates: [],
      candidates: { baseUrls: [], apiKeys: [] },
      summary: {
        hasEnhancedBaseUrl: false,
        hasEnhancedApiKey: false,
        hasCleanup: false,
        usesEnhancedResult: false,
        autoPromptEligible: false,
        enhancedAutoPromptEligible: false,
      },
      baseUrl: null,
      apiKey: null,
    }
  }

  const baseUrlCandidates = extractBaseUrlCandidates(rawInput)
  const apiKeyCandidates = extractApiKeyCandidates(rawInput, options)
  const selectedBaseUrl = baseUrlCandidates[0]
  const selectedApiKey = apiKeyCandidates[0]

  return {
    baseUrlCandidates: baseUrlCandidates.map((candidate) => candidate.value),
    apiKeyCandidates: apiKeyCandidates.map((candidate) => candidate.value),
    candidates: {
      baseUrls: baseUrlCandidates.map(toPublicCandidate),
      apiKeys: apiKeyCandidates.map(toPublicCandidate),
    },
    summary: buildSummary({
      baseUrls: baseUrlCandidates,
      apiKeys: apiKeyCandidates,
      selectedBaseUrl,
      selectedApiKey,
    }),
    baseUrl: selectedBaseUrl?.value ?? null,
    apiKey: selectedApiKey?.value ?? null,
  }
}
