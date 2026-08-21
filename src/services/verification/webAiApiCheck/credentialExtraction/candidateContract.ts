export const API_CHECK_CANDIDATE_CONFIDENCES = {
  STANDARD: "standard",
  ENHANCED_HIGH: "enhancedHigh",
  ENHANCED_MEDIUM: "enhancedMedium",
} as const

export type ApiCheckCandidateConfidence =
  (typeof API_CHECK_CANDIDATE_CONFIDENCES)[keyof typeof API_CHECK_CANDIDATE_CONFIDENCES]

export const API_CHECK_CANDIDATE_REASONS = {
  LABELED: "labeled",
  GENERIC_URL: "genericUrl",
  AUTHORIZATION_HEADER: "authorizationHeader",
  KNOWN_PREFIX: "knownPrefix",
  UNKNOWN_SHORT_PREFIX: "unknownShortPrefix",
  UNKNOWN_LONG_PREFIX: "unknownLongPrefix",
  MULTI_SEGMENT: "multiSegment",
  UNSEPARATED_LONG_TOKEN: "unseparatedLongToken",
  BARE_DOMAIN: "bareDomain",
  SCHEME_ADDED: "schemeAdded",
  PATH_NORMALIZED: "pathNormalized",
  ILLEGAL_CHARS_REMOVED: "illegalCharsRemoved",
  CUSTOM_REGEX_REMOVED: "customRegexRemoved",
  BASE64_DECODED: "base64Decoded",
  BASE64_ENCODED_SOURCE: "base64EncodedSource",
} as const

export type ApiCheckCandidateReason =
  (typeof API_CHECK_CANDIDATE_REASONS)[keyof typeof API_CHECK_CANDIDATE_REASONS]

export const API_CHECK_CANDIDATE_KINDS = {
  BASE_URL: "baseUrl",
  API_KEY: "apiKey",
} as const

export type ApiCheckCandidateKind =
  (typeof API_CHECK_CANDIDATE_KINDS)[keyof typeof API_CHECK_CANDIDATE_KINDS]

export type ApiCheckCandidate = {
  value: string
  kind: ApiCheckCandidateKind
  confidence: ApiCheckCandidateConfidence
  reasons: ApiCheckCandidateReason[]
  cleanupApplied?: boolean
  autoPromptEligible: boolean
}

export type ApiCheckExtractionSummary = {
  hasEnhancedBaseUrl: boolean
  hasEnhancedApiKey: boolean
  hasCleanup: boolean
  usesEnhancedResult: boolean
  autoPromptEligible: boolean
  enhancedAutoPromptEligible: boolean
}

export type ApiCheckExtractionResult = {
  baseUrlCandidates: string[]
  apiKeyCandidates: string[]
  candidates: {
    baseUrls: ApiCheckCandidate[]
    apiKeys: ApiCheckCandidate[]
  }
  summary: ApiCheckExtractionSummary
  baseUrl: string | null
  apiKey: string | null
}

export type ApiCheckExtractionOptions = {
  apiKeyCleanupPatterns?: string[]
}

export type InternalApiCheckCandidate = ApiCheckCandidate & {
  insertionOrder: number
}
