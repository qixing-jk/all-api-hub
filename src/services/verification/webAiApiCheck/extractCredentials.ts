import { normalizeHttpUrl } from "~/utils/core/url"
import {
  normalizeUrlForBasePath,
  normalizeUrlPathname,
  transformNormalizedUrlPath,
} from "~/utils/core/urlParsing"

/**
 * Extraction result for the in-page Web AI API Check feature.
 *
 * The extractor is intentionally "best-effort" and returns candidate lists
 * (deduplicated) plus a suggested best match for each field.
 */
export type ApiCheckCandidateConfidence =
  | "standard"
  | "enhancedHigh"
  | "enhancedMedium"

export type ApiCheckCandidateReason =
  | "labeled"
  | "genericUrl"
  | "authorizationHeader"
  | "knownPrefix"
  | "unknownShortPrefix"
  | "unknownLongPrefix"
  | "multiSegment"
  | "unseparatedLongToken"
  | "bareDomain"
  | "schemeAdded"
  | "pathNormalized"
  | "illegalCharsRemoved"
  | "customRegexRemoved"
  | "base64Decoded"

export type ApiCheckCandidateKind = "baseUrl" | "apiKey"

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

type ApiCheckExtractionResult = {
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

type ApiCheckExtractionOptions = {
  apiKeyCleanupPatterns?: string[]
}

type InternalApiCheckCandidate = ApiCheckCandidate & {
  insertionOrder: number
}

/**
 * Remove common wrapping punctuation for tokens extracted from free-form text.
 */
function trimWrappingPunctuation(value: string): string {
  return (value || "")
    .trim()
    .replace(/^[("'`[{<]+/, "")
    .replace(/[)"'`}\]>.,;]+$/, "")
}

const CONFIDENCE_RANK: Record<ApiCheckCandidateConfidence, number> = {
  standard: 0,
  enhancedHigh: 1,
  enhancedMedium: 2,
}

/**
 * Merge reason tags without changing their first-seen ordering.
 */
function mergeReasons(
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
 * Sort candidates from most suitable best-match choice to least suitable.
 */
function compareCandidates(
  a: InternalApiCheckCandidate,
  b: InternalApiCheckCandidate,
) {
  const confidenceDelta =
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
  if (confidenceDelta !== 0) return confidenceDelta

  const labeledDelta =
    Number(b.reasons.includes("labeled")) -
    Number(a.reasons.includes("labeled"))
  if (labeledDelta !== 0) return labeledDelta

  const knownPrefixDelta =
    Number(b.reasons.includes("knownPrefix")) -
    Number(a.reasons.includes("knownPrefix"))
  if (knownPrefixDelta !== 0) return knownPrefixDelta

  const cleanupDelta = Number(!!b.cleanupApplied) - Number(!!a.cleanupApplied)
  if (cleanupDelta !== 0) return cleanupDelta

  return a.insertionOrder - b.insertionOrder
}

/**
 * Rank API key candidates by how likely the final value is to be usable.
 */
function getApiKeyUsefulnessRank(candidate: InternalApiCheckCandidate) {
  if (candidate.reasons.includes("knownPrefix")) return 4
  if (candidate.reasons.includes("unknownShortPrefix")) return 3
  if (
    candidate.reasons.includes("unknownLongPrefix") ||
    candidate.reasons.includes("multiSegment")
  ) {
    return 2
  }
  if (candidate.reasons.includes("unseparatedLongToken")) return 1
  return 0
}

/**
 * Sort API key candidates by final key-likeness before source hints.
 */
function compareApiKeyCandidates(
  a: InternalApiCheckCandidate,
  b: InternalApiCheckCandidate,
) {
  const usefulnessDelta =
    getApiKeyUsefulnessRank(b) - getApiKeyUsefulnessRank(a)
  if (usefulnessDelta !== 0) return usefulnessDelta

  const labeledDelta =
    Number(b.reasons.includes("labeled")) -
    Number(a.reasons.includes("labeled"))
  if (labeledDelta !== 0) return labeledDelta

  const authorizationHeaderDelta =
    Number(b.reasons.includes("authorizationHeader")) -
    Number(a.reasons.includes("authorizationHeader"))
  if (authorizationHeaderDelta !== 0) return authorizationHeaderDelta

  const cleanupDelta = Number(!!b.cleanupApplied) - Number(!!a.cleanupApplied)
  if (cleanupDelta !== 0) return cleanupDelta

  return a.insertionOrder - b.insertionOrder
}

/**
 * Insert a structured candidate or merge it into an existing value match.
 */
function pushCandidate(
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
function toPublicCandidate(candidate: InternalApiCheckCandidate) {
  const { insertionOrder: _insertionOrder, ...publicCandidate } = candidate
  return publicCandidate
}

/**
 * Build aggregate flags for compatibility and later enhanced extraction flows.
 */
function buildSummary(params: {
  baseUrls: InternalApiCheckCandidate[]
  apiKeys: InternalApiCheckCandidate[]
  selectedBaseUrl?: InternalApiCheckCandidate
  selectedApiKey?: InternalApiCheckCandidate
}): ApiCheckExtractionSummary {
  const hasEnhancedBaseUrl = params.baseUrls.some(
    (candidate) => candidate.confidence !== "standard",
  )
  const hasEnhancedApiKey = params.apiKeys.some(
    (candidate) => candidate.confidence !== "standard",
  )
  const hasCleanup = params.apiKeys.some(
    (candidate) => candidate.cleanupApplied,
  )
  const selectedBaseUrlUsesEnhanced =
    !!params.selectedBaseUrl && params.selectedBaseUrl.confidence !== "standard"
  const selectedApiKeyUsesEnhanced =
    !!params.selectedApiKey && params.selectedApiKey.confidence !== "standard"
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
      !params.selectedApiKey.reasons.includes("unseparatedLongToken"))

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

/**
 * Normalize a user-provided URL-like string into a stable base URL for API checks.
 *
 * - Adds implicit https:// when the scheme is missing.
 * - Drops query/hash fragments (base URLs should not include them).
 * - Removes trailing slashes.
 */
export function normalizeApiCheckBaseUrl(baseUrl: string): string | null {
  const normalized = normalizeHttpUrl(trimWrappingPunctuation(baseUrl))
  if (!normalized) return null

  return normalizeUrlForBasePath(normalized) || null
}

/**
 * Normalize a base URL by stripping a specific path segment and anything after it.
 */
function normalizeBaseUrlByStrippingPathSegment(
  baseUrl: string,
  segmentToStrip: string,
): string | null {
  const normalized = normalizeApiCheckBaseUrl(baseUrl)
  if (!normalized) return null

  return transformNormalizedUrlPath(normalized, (pathname) => {
    const segments = normalizeUrlPathname(pathname).split("/").filter(Boolean)
    const normalizedSegmentToStrip = segmentToStrip.toLowerCase()
    let lastMatchIndex = -1

    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (segments[index].toLowerCase() === normalizedSegmentToStrip) {
        lastMatchIndex = index
        break
      }
    }

    if (lastMatchIndex < 0) {
      return pathname
    }

    const prefixSegments = segments.slice(0, lastMatchIndex)
    return prefixSegments.length ? `/${prefixSegments.join("/")}` : "/"
  })
}

/**
 * Normalize a base URL for OpenAI/OpenAI-compatible requests.
 *
 * This preserves any deployment subpath (e.g. https://example.com/api) while
 * stripping any `/v1` segment and anything after it so later joins like
 * `<base>/v1/models` never become `/v1/v1/models` or `/v1/chat/.../v1/models`.
 */
export function normalizeOpenAiFamilyBaseUrl(baseUrl: string): string | null {
  return normalizeBaseUrlByStrippingPathSegment(baseUrl, "v1")
}

/**
 * Normalize a base URL for Google/Gemini requests.
 *
 * This preserves any deployment subpath (e.g. https://example.com/api) while
 * stripping any `/v1beta` segment and anything after it so later joins like
 * `<base>/v1beta/models` never become `/v1beta/v1beta/models` or
 * `/v1beta/models/.../v1beta/models`.
 */
export function normalizeGoogleFamilyBaseUrl(baseUrl: string): string | null {
  return normalizeBaseUrlByStrippingPathSegment(baseUrl, "v1beta")
}

const KNOWN_KEY_PREFIXES = [
  { value: "sk-ant", requiresHyphenSuffix: true },
  { value: "sk-or", requiresHyphenSuffix: true },
  { value: "sk", requiresHyphenSuffix: true },
  // Xiaomi MiMo keys use the `tp-` token prefix.
  { value: "tp", requiresHyphenSuffix: true },
  { value: "AIza", requiresHyphenSuffix: false },
] as const

/**
 * Escape a literal prefix before composing provider-token regexes.
 */
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const KNOWN_KEY_PREFIX_PATTERN = new RegExp(
  `(?<![A-Za-z0-9_-])(?:${KNOWN_KEY_PREFIXES.map((prefix) =>
    escapeRegExp(prefix.value),
  ).join("|")})`,
  "i",
)

/**
 * Build the token-body pattern for a known provider key prefix.
 */
function getKnownKeyPrefixPattern(prefix: (typeof KNOWN_KEY_PREFIXES)[number]) {
  const escaped = escapeRegExp(prefix.value)
  return prefix.requiresHyphenSuffix
    ? `${escaped}-[a-z0-9_-]{10,}`
    : `${escaped}[a-z0-9_-]{10,}`
}

const KNOWN_KEY_TOKEN_PATTERN = new RegExp(
  `\\b(?:${KNOWN_KEY_PREFIXES.map(getKnownKeyPrefixPattern).join("|")})\\b`,
  "gi",
)

/**
 * Start cleanup at a known key prefix when surrounding label text is captured.
 */
function trimToKnownKeyPrefix(raw: string) {
  const prefixMatch = KNOWN_KEY_PREFIX_PATTERN.exec(raw)
  return prefixMatch ? raw.slice(prefixMatch.index) : raw
}

/**
 * Remove characters that cannot be part of supported API key tokens.
 */
function cleanKeyWindow(raw: string) {
  const cleaned = trimToKnownKeyPrefix(raw).replace(/[^A-Za-z0-9_-]/g, "")
  return {
    value: cleaned,
    cleanupApplied: cleaned !== raw,
  }
}

/**
 * Apply user-provided removal regexes to an API key candidate window.
 */
function applyCustomApiKeyCleanupPatterns(
  raw: string,
  patterns: string[] = [],
) {
  let value = raw
  let cleanupApplied = false

  for (const pattern of patterns) {
    const normalizedPattern = pattern.trim()
    if (!normalizedPattern) continue

    try {
      const regex = new RegExp(normalizedPattern, "gi")
      const nextValue = value.replace(regex, "")
      if (nextValue !== value) {
        value = nextValue
        cleanupApplied = true
      }
    } catch {
      // Invalid saved patterns are ignored, matching settings validation.
    }
  }

  return { value, cleanupApplied }
}

/**
 * Decode pasted base64/base64url text before key-shape classification.
 */
function decodeBase64ApiKeyCandidate(raw: string): string | null {
  const encoded = trimWrappingPunctuation(raw).replace(/[ \t\r\n]+/g, "")
  if (encoded.length < 24 || encoded.length % 4 === 1) return null
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) return null

  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const decoded = atob(padded)
  if (!/^[\x20-\x7E]+$/.test(decoded)) return null
  if (decoded === encoded) return null
  return decoded
}

/**
 * Detect token segments that look generated rather than natural language.
 */
function isRandomLookingSegment(segment: string): boolean {
  if (segment.length < 12) return false
  const hasLetter = /[A-Za-z]/.test(segment)
  const hasDigit = /\d/.test(segment)
  const hasMixedCase = /[a-z]/.test(segment) && /[A-Z]/.test(segment)
  return hasLetter && (hasDigit || hasMixedCase)
}

/**
 * Filter out ordinary dashed or underscored words that are not key-like.
 */
function isNaturalLanguageMultiSegment(value: string): boolean {
  const segments = value.split(/[-_]/).filter(Boolean)
  if (segments.length < 2) return false
  return segments.every((segment) => /^[a-z]{2,12}$/i.test(segment))
}

/**
 * Score a raw token-like window as an API key candidate when it is plausible.
 */
function classifyApiKeyCandidate(
  raw: string,
): Omit<ApiCheckCandidate, "kind"> | null {
  const trimmed = trimWrappingPunctuation(raw)
  if (!trimmed) return null

  const cleaned = cleanKeyWindow(trimmed)
  const value = cleaned.value
  if (value.length < 18) return null
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  if (isNaturalLanguageMultiSegment(value)) return null

  const lowerValue = value.toLowerCase()
  const segments = value.split(/[-_]/).filter(Boolean)
  const hasSeparator = /[-_]/.test(value)
  const hasLongRandomSegment = segments.some((segment) =>
    isRandomLookingSegment(segment),
  )

  const knownHyphenPrefix = KNOWN_KEY_PREFIXES.find(
    (prefix) =>
      prefix.requiresHyphenSuffix && lowerValue.startsWith(`${prefix.value}-`),
  )

  if (knownHyphenPrefix || value.startsWith("AIza")) {
    return {
      value,
      confidence: "standard",
      reasons: [
        "knownPrefix",
        ...(segments.length >= 3
          ? (["multiSegment"] satisfies ApiCheckCandidateReason[])
          : []),
        ...(cleaned.cleanupApplied
          ? (["illegalCharsRemoved"] satisfies ApiCheckCandidateReason[])
          : []),
      ],
      cleanupApplied: cleaned.cleanupApplied,
      autoPromptEligible: true,
    }
  }

  if (hasSeparator && segments.length >= 2) {
    const prefix = segments[0] ?? ""
    const body = segments.slice(1).join("")
    const isShortPrefix = prefix.length >= 1 && prefix.length <= 6
    const hasLongBody = body.length >= 24 && isRandomLookingSegment(body)
    const isMultiSegment =
      value.length >= 32 && hasLongRandomSegment && segments.length >= 2

    if (isShortPrefix && hasLongBody) {
      return {
        value,
        confidence: "enhancedHigh",
        reasons: [
          "unknownShortPrefix",
          ...(isMultiSegment
            ? (["multiSegment"] satisfies ApiCheckCandidateReason[])
            : []),
          ...(cleaned.cleanupApplied
            ? (["illegalCharsRemoved"] satisfies ApiCheckCandidateReason[])
            : []),
        ],
        cleanupApplied: cleaned.cleanupApplied,
        autoPromptEligible: true,
      }
    }

    if (isMultiSegment) {
      return {
        value,
        confidence: "enhancedMedium",
        reasons: [
          prefix.length >= 7 ? "unknownLongPrefix" : "multiSegment",
          ...(cleaned.cleanupApplied
            ? (["illegalCharsRemoved"] satisfies ApiCheckCandidateReason[])
            : []),
        ],
        cleanupApplied: cleaned.cleanupApplied,
        autoPromptEligible: false,
      }
    }
  }

  if (!hasSeparator && value.length >= 40 && isRandomLookingSegment(value)) {
    return {
      value,
      confidence: "enhancedMedium",
      reasons: [
        "unseparatedLongToken",
        ...(cleaned.cleanupApplied
          ? (["illegalCharsRemoved"] satisfies ApiCheckCandidateReason[])
          : []),
      ],
      cleanupApplied: cleaned.cleanupApplied,
      autoPromptEligible: false,
    }
  }

  return null
}

const COMMON_NON_URL_FILE_EXTENSIONS = new Set([
  "css",
  "csv",
  "gif",
  "jpeg",
  "jpg",
  "js",
  "json",
  "lock",
  "md",
  "png",
  "svg",
  "ts",
  "tsx",
  "txt",
  "yml",
  "yaml",
])

/**
 * Detect dotted numeric versions that look like hostnames to the bare-domain regex.
 */
function isLikelyVersionString(value: string): boolean {
  return /^\d+(?:\.\d+){1,3}$/.test(value)
}

/**
 * Check whether a domain-like regex hit is part of an email address.
 */
function isEmailAddressLike(
  input: string,
  startIndex: number,
  endIndex: number,
) {
  return input[startIndex - 1] === "@" || input[endIndex] === "@"
}

/**
 * Filter bare-domain hits down to URL-like hostnames and optional paths.
 */
function isLikelyBareDomainCandidate(raw: string): boolean {
  const candidate = trimWrappingPunctuation(raw)
  if (!candidate || candidate.includes("@")) return false
  if (/^https?:\/\//i.test(candidate)) return false
  if (isLikelyVersionString(candidate)) return false

  const host = candidate.split(/[/?#]/, 1)[0] ?? ""
  if (!host.includes(".")) return false
  if (!/^[a-z0-9.-]+$/i.test(host)) return false
  if (host.startsWith(".") || host.endsWith(".")) return false
  if (host.split(".").some((part) => part.length === 0)) return false

  const parts = host.split(".")
  const tld = parts[parts.length - 1]?.toLowerCase() ?? ""
  if (tld.length < 2) return false
  if (/^\d+$/.test(tld)) return false

  const hasPath = /[/?#]/.test(candidate)
  if (!hasPath && COMMON_NON_URL_FILE_EXTENSIONS.has(tld)) return false

  return true
}

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

  const cleanedApiKeyInput = applyCustomApiKeyCleanupPatterns(
    rawInput,
    options.apiKeyCleanupPatterns,
  )
  const apiKeyInput = cleanedApiKeyInput.value

  const baseUrlCandidates: InternalApiCheckCandidate[] = []
  const apiKeyCandidates: InternalApiCheckCandidate[] = []
  let insertionOrder = 0

  const pushBaseUrlCandidate = (
    value: string | null,
    reasons: ApiCheckCandidateReason[],
    confidence: ApiCheckCandidateConfidence = "standard",
  ) => {
    if (!value) return
    pushCandidate(baseUrlCandidates, {
      value,
      kind: "baseUrl",
      confidence,
      reasons,
      autoPromptEligible: true,
      insertionOrder,
    })
    insertionOrder += 1
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
        ? mergeReasons(reasons, ["customRegexRemoved"])
        : reasons

    const pushClassifiedCandidate = (
      candidateValue: string,
      candidateReasons: ApiCheckCandidateReason[],
      cleanupApplied = false,
    ) => {
      const classified = classifyApiKeyCandidate(candidateValue)
      if (!classified) return false
      pushCandidate(apiKeyCandidates, {
        ...classified,
        kind: "apiKey",
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

    const decoded = decodeBase64ApiKeyCandidate(candidateValue)
    const pushedDecoded = decoded
      ? pushClassifiedCandidate(
          decoded,
          mergeReasons(candidateReasons, ["base64Decoded"]),
          true,
        )
      : false
    if (pushedDecoded) return

    const classified = classifyApiKeyCandidate(candidateValue)
    if (classified) {
      pushCandidate(apiKeyCandidates, {
        ...classified,
        kind: "apiKey",
        reasons: mergeReasons(candidateReasons, classified.reasons),
        cleanupApplied:
          cleanedApiKeyInput.cleanupApplied ||
          cleanedByCustomPatterns.cleanupApplied ||
          classified.cleanupApplied,
        insertionOrder,
      })
      insertionOrder += 1
      return
    }
    if (candidateValue.length < 10) return
    const fallbackCandidate: InternalApiCheckCandidate = {
      value: candidateValue,
      kind: "apiKey",
      confidence: "standard",
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
    pushCandidate(apiKeyCandidates, fallbackCandidate)
    insertionOrder += 1
  }

  // 1) Keyword-guided URL extractions (highest confidence).
  const baseUrlPattern =
    /\b(?:base[_\s-]?url|baseURL|baseUrl|api[_\s-]?base|endpoint|proxy[_\s-]?url)\b\s*[:=]\s*([^\s'"]+)/gi
  for (const match of rawInput.matchAll(baseUrlPattern)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    const normalized = normalizeApiCheckBaseUrl(raw)
    const openAiNormalized = normalizeOpenAiFamilyBaseUrl(raw)
    const googleNormalized = normalizeGoogleFamilyBaseUrl(raw)
    const isLabeledBareDomain =
      !/^https?:\/\//i.test(raw) && isLikelyBareDomainCandidate(raw)
    const labeledReasons: ApiCheckCandidateReason[] = isLabeledBareDomain
      ? ["labeled", "bareDomain", "schemeAdded"]
      : ["labeled"]
    const confidence: ApiCheckCandidateConfidence = isLabeledBareDomain
      ? "enhancedHigh"
      : "standard"
    if (openAiNormalized !== normalized) {
      pushBaseUrlCandidate(
        openAiNormalized,
        [...labeledReasons, "pathNormalized"],
        confidence,
      )
    }
    if (googleNormalized !== normalized) {
      pushBaseUrlCandidate(
        googleNormalized,
        [...labeledReasons, "pathNormalized"],
        confidence,
      )
    }
    pushBaseUrlCandidate(normalized, labeledReasons, confidence)
  }

  // 2) Generic URL scan (fallback).
  const urlPattern = /\bhttps?:\/\/[^\s'"]+/gi
  for (const match of rawInput.matchAll(urlPattern)) {
    const raw = trimWrappingPunctuation(match[0] ?? "")
    const normalized = normalizeApiCheckBaseUrl(raw)
    const openAiNormalized = normalizeOpenAiFamilyBaseUrl(raw)
    const googleNormalized = normalizeGoogleFamilyBaseUrl(raw)
    if (openAiNormalized !== normalized) {
      pushBaseUrlCandidate(openAiNormalized, ["genericUrl", "pathNormalized"])
    }
    if (googleNormalized !== normalized) {
      pushBaseUrlCandidate(googleNormalized, ["genericUrl", "pathNormalized"])
    }
    pushBaseUrlCandidate(normalized, ["genericUrl"])
  }

  // 3) Bare domain scan, adding a scheme before normalization.
  const bareDomainPattern =
    /(^|[\s("'`[{<])([a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s'"]*)?)/gi
  for (const match of rawInput.matchAll(bareDomainPattern)) {
    const raw = trimWrappingPunctuation(match[2] ?? "")
    const startIndex = match.index ?? 0
    const endIndex = startIndex + match[0].length
    if (isEmailAddressLike(rawInput, startIndex, endIndex)) continue
    if (!isLikelyBareDomainCandidate(raw)) continue

    const withScheme = `https://${raw}`
    const normalized = normalizeApiCheckBaseUrl(withScheme)
    const openAiNormalized = normalizeOpenAiFamilyBaseUrl(withScheme)
    const googleNormalized = normalizeGoogleFamilyBaseUrl(withScheme)
    const baseReasons: ApiCheckCandidateReason[] = ["bareDomain", "schemeAdded"]

    if (openAiNormalized !== normalized) {
      pushBaseUrlCandidate(
        openAiNormalized,
        [...baseReasons, "pathNormalized"],
        "enhancedHigh",
      )
    }
    if (googleNormalized !== normalized) {
      pushBaseUrlCandidate(
        googleNormalized,
        [...baseReasons, "pathNormalized"],
        "enhancedHigh",
      )
    }
    pushBaseUrlCandidate(normalized, baseReasons, "enhancedHigh")
  }

  // 4) Keyword-guided key extraction.
  const authBearerPattern = /\bAuthorization\b\s*:\s*Bearer\s+([^\s'"]+)/gi
  for (const match of apiKeyInput.matchAll(authBearerPattern)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw) pushApiKeyCandidate(raw, ["authorizationHeader", "knownPrefix"])
  }

  const apiKeyPattern =
    /\b(?:api[_\s-]?key|key|token|access[_\s-]?token|secret)\b\s*[:=]\s*([^\s'"]+)/gi
  for (const match of apiKeyInput.matchAll(apiKeyPattern)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw) pushApiKeyCandidate(raw, ["labeled"])
  }

  const labeledSeparatedKnownKeyWindowPattern =
    /\b(?:api[_\s-]?key|key|token|access[_\s-]?token|secret)\b\s*[:=]\s*((?:(?:sk-ant|sk-or|sk|tp)-|AIza)[A-Za-z0-9_-]{6,}(?:[ \t.\u200B-\u200D]+[A-Za-z0-9_-]{6,})+)(?=$|[\r\n"'`,;)\]}])/gi
  for (const match of apiKeyInput.matchAll(
    labeledSeparatedKnownKeyWindowPattern,
  )) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw) pushApiKeyCandidate(raw, ["labeled"])
  }

  const separatedKnownKeyWindowPattern =
    /(?<![A-Za-z0-9_-])((?:(?:sk-ant|sk-or|sk|tp)-|AIza)[A-Za-z0-9_-]{6,}(?:[ \t.\u200B-\u200D]+[A-Za-z0-9_-]{6,})+)(?![A-Za-z0-9_-])/gi
  for (const match of apiKeyInput.matchAll(separatedKnownKeyWindowPattern)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw) pushApiKeyCandidate(raw, ["knownPrefix"])
  }

  // 5) Common provider token prefixes (lowest confidence, but useful when no labels exist).
  for (const match of apiKeyInput.matchAll(KNOWN_KEY_TOKEN_PATTERN)) {
    const raw = trimWrappingPunctuation(match[0] ?? "")
    if (raw) pushApiKeyCandidate(raw, ["knownPrefix"])
  }

  // 6) Enhanced key windows: bounded to a single non-whitespace token so cleanup
  // can remove accidental punctuation without merging URLs, assignments, or lines.
  const enhancedKeyWindowPattern =
    /(?<![A-Za-z0-9_-])([A-Za-z0-9_-][^\s'"=:/\\]{17,})(?![A-Za-z0-9_-])/g
  for (const match of apiKeyInput.matchAll(enhancedKeyWindowPattern)) {
    const classified = classifyApiKeyCandidate(match[1] ?? "")
    if (!classified) continue

    pushCandidate(apiKeyCandidates, {
      ...classified,
      kind: "apiKey",
      reasons: cleanedApiKeyInput.cleanupApplied
        ? mergeReasons(classified.reasons, ["customRegexRemoved"])
        : classified.reasons,
      cleanupApplied:
        cleanedApiKeyInput.cleanupApplied || classified.cleanupApplied,
      insertionOrder,
    })
    insertionOrder += 1
  }

  baseUrlCandidates.sort(compareCandidates)
  apiKeyCandidates.sort(compareApiKeyCandidates)

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
