import { isSafeRegexPattern } from "~/utils/core/regex"

import { trimWrappingPunctuation } from "./candidateCollection"
import {
  API_CHECK_CANDIDATE_CONFIDENCES,
  API_CHECK_CANDIDATE_REASONS,
  type ApiCheckCandidate,
  type ApiCheckCandidateReason,
} from "./candidateContract"

// Keep more-specific prefixes before shared shorter prefixes because the
// generated RegExp alternations use first-match ordering.
const KNOWN_KEY_PREFIXES = [
  { value: "sk-ant", requiresHyphenSuffix: true },
  { value: "sk-or", requiresHyphenSuffix: true },
  { value: "sk", requiresHyphenSuffix: true },
  // Xiaomi MiMo keys use the `tp-` token prefix.
  { value: "tp", requiresHyphenSuffix: true },
  { value: "AIza", requiresHyphenSuffix: false },
] as const

const API_KEY_HEURISTICS = {
  minimumCandidateLength: 18,
  minimumFallbackLength: 10,
  minimumKnownPrefixBodyLength: 10,
  minimumSeparatedChunkLength: 6,
  minimumRandomSegmentLength: 12,
  minimumNaturalLanguageSegmentLength: 2,
  maximumNaturalLanguageSegmentLength: 12,
  maximumShortPrefixLength: 6,
  minimumRandomBodyLength: 24,
  minimumMultiSegmentLength: 32,
  minimumUnseparatedLength: 40,
  minimumBase64EncodedLength: 24,
  maximumBase64DecodeDepth: 4,
} as const

/**
 * Escape a literal prefix before composing provider-token regexes.
 */
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const KNOWN_KEY_WINDOW_PREFIX_PATTERN_SOURCE = `(?:${KNOWN_KEY_PREFIXES.map(
  (prefix) =>
    `${escapeRegExp(prefix.value)}${prefix.requiresHyphenSuffix ? "-" : ""}`,
).join("|")})`
const ENGLISH_API_KEY_LABEL_PATTERN_SOURCE = String.raw`\b(?:api[_\s-]?key|key|token|access[_\s-]?token|secret)\b`
const API_KEY_LABEL_PATTERN_SOURCE = `(?:${ENGLISH_API_KEY_LABEL_PATTERN_SOURCE}|API\\s*密钥|密钥|访问令牌|令牌)`
const API_KEY_LABEL_SEPARATOR_PATTERN_SOURCE = "[:=：＝]"
const SEPARATED_KNOWN_KEY_WINDOW_PATTERN_SOURCE = `(${KNOWN_KEY_WINDOW_PREFIX_PATTERN_SOURCE}[A-Za-z0-9_-]{${API_KEY_HEURISTICS.minimumSeparatedChunkLength},}(?:[ \\t.\\u200B-\\u200D]+[A-Za-z0-9_-]{${API_KEY_HEURISTICS.minimumSeparatedChunkLength},})+)`

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
    ? `${escaped}-[a-z0-9_-]{${API_KEY_HEURISTICS.minimumKnownPrefixBodyLength},}`
    : `${escaped}[a-z0-9_-]{${API_KEY_HEURISTICS.minimumKnownPrefixBodyLength},}`
}

const KNOWN_KEY_TOKEN_PATTERN_SOURCE = `\\b(?:${KNOWN_KEY_PREFIXES.map(
  getKnownKeyPrefixPattern,
).join("|")})\\b`

/**
 * Create fresh global regexes for one extraction pass.
 */
export function createApiKeyExtractionPatterns() {
  return {
    authorizationHeader: /\bAuthorization\b\s*:\s*Bearer\s+([^\s'"]+)/gi,
    labeled: new RegExp(
      `${API_KEY_LABEL_PATTERN_SOURCE}\\s*${API_KEY_LABEL_SEPARATOR_PATTERN_SOURCE}\\s*([^\\s'"]+)`,
      "gi",
    ),
    labeledSeparated: new RegExp(
      `${API_KEY_LABEL_PATTERN_SOURCE}\\s*${API_KEY_LABEL_SEPARATOR_PATTERN_SOURCE}\\s*${SEPARATED_KNOWN_KEY_WINDOW_PATTERN_SOURCE}(?=$|[\\r\\n"'\`,;)\\]}])`,
      "gi",
    ),
    separatedKnown: new RegExp(
      `(?<![A-Za-z0-9_-])${SEPARATED_KNOWN_KEY_WINDOW_PATTERN_SOURCE}(?![A-Za-z0-9_-])`,
      "gi",
    ),
    knownToken: new RegExp(KNOWN_KEY_TOKEN_PATTERN_SOURCE, "gi"),
    enhancedWindow: new RegExp(
      `(?<![A-Za-z0-9_-])([A-Za-z0-9_-][^\\s'"=:/\\\\：＝]{${API_KEY_HEURISTICS.minimumCandidateLength - 1},})(?![A-Za-z0-9_-])`,
      "g",
    ),
  }
}

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
export function applyCustomApiKeyCleanupPatterns(
  raw: string,
  patterns: string[] = [],
) {
  let value = raw
  let cleanupApplied = false

  for (const pattern of patterns) {
    const normalizedPattern = pattern.trim()
    if (!normalizedPattern) continue
    if (!isSafeRegexPattern(normalizedPattern, "gi")) continue

    const regex = new RegExp(normalizedPattern, "gi")
    const nextValue = value.replace(regex, "")
    if (nextValue !== value) {
      value = nextValue
      cleanupApplied = true
    }
  }

  return { value, cleanupApplied }
}

/**
 * Decode pasted base64/base64url text before key-shape classification.
 */
function decodeBase64ApiKeyCandidate(raw: string): string | null {
  const encoded = trimWrappingPunctuation(raw).replace(/[ \t\r\n]+/g, "")
  if (
    encoded.length < API_KEY_HEURISTICS.minimumBase64EncodedLength ||
    encoded.length % 4 === 1
  )
    return null
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) return null

  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  let decoded: string
  try {
    decoded = atob(padded)
  } catch {
    return null
  }
  if (!/^[\x20-\x7E]+$/.test(decoded)) return null
  return decoded
}

/**
 * Decode nested base64/base64url values with a bounded depth and cycle guard.
 */
export function decodeBase64ApiKeyCandidateLayers(raw: string): string[] {
  const decodedLayers: string[] = []
  const seenValues = new Set([raw])
  let currentValue = raw

  for (
    let depth = 0;
    depth < API_KEY_HEURISTICS.maximumBase64DecodeDepth;
    depth += 1
  ) {
    const decoded = decodeBase64ApiKeyCandidate(currentValue)
    if (!decoded || seenValues.has(decoded)) break

    decodedLayers.push(decoded)
    seenValues.add(decoded)
    currentValue = decoded
  }

  return decodedLayers
}

/**
 * Detect token segments that look generated rather than natural language.
 */
function isRandomLookingSegment(segment: string): boolean {
  if (segment.length < API_KEY_HEURISTICS.minimumRandomSegmentLength)
    return false
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
  return segments.every(
    (segment) =>
      /^[a-z]+$/i.test(segment) &&
      segment.length >=
        API_KEY_HEURISTICS.minimumNaturalLanguageSegmentLength &&
      segment.length <= API_KEY_HEURISTICS.maximumNaturalLanguageSegmentLength,
  )
}

/**
 * Score a raw token-like window as an API key candidate when it is plausible.
 */
export function classifyApiKeyCandidate(
  raw: string,
): Omit<ApiCheckCandidate, "kind"> | null {
  const trimmed = trimWrappingPunctuation(raw)
  if (!trimmed) return null

  const cleaned = cleanKeyWindow(trimmed)
  const value = cleaned.value
  if (value.length < API_KEY_HEURISTICS.minimumCandidateLength) return null
  if (isNaturalLanguageMultiSegment(value)) return null

  const lowerValue = value.toLowerCase()
  const segments = value.split(/[-_]/).filter(Boolean)
  const hasSeparator = /[-_]/.test(value)
  const hasLongRandomSegment = segments.some((segment) =>
    isRandomLookingSegment(segment),
  )
  const cleanupReasons: ApiCheckCandidateReason[] = cleaned.cleanupApplied
    ? [API_CHECK_CANDIDATE_REASONS.ILLEGAL_CHARS_REMOVED]
    : []

  const knownPrefix = KNOWN_KEY_PREFIXES.find((prefix) =>
    lowerValue.startsWith(
      prefix.requiresHyphenSuffix
        ? `${prefix.value.toLowerCase()}-`
        : prefix.value.toLowerCase(),
    ),
  )

  if (knownPrefix) {
    return {
      value,
      confidence: API_CHECK_CANDIDATE_CONFIDENCES.STANDARD,
      reasons: [
        API_CHECK_CANDIDATE_REASONS.KNOWN_PREFIX,
        ...(segments.length >= 3
          ? ([
              API_CHECK_CANDIDATE_REASONS.MULTI_SEGMENT,
            ] satisfies ApiCheckCandidateReason[])
          : []),
        ...cleanupReasons,
      ],
      cleanupApplied: cleaned.cleanupApplied,
      autoPromptEligible: true,
    }
  }

  if (hasSeparator && segments.length >= 2) {
    const prefix = segments[0] ?? ""
    const body = segments.slice(1).join("")
    const isShortPrefix =
      prefix.length >= 1 &&
      prefix.length <= API_KEY_HEURISTICS.maximumShortPrefixLength
    const hasLongBody =
      body.length >= API_KEY_HEURISTICS.minimumRandomBodyLength &&
      isRandomLookingSegment(body)
    const isMultiSegment =
      value.length >= API_KEY_HEURISTICS.minimumMultiSegmentLength &&
      hasLongRandomSegment &&
      segments.length >= 2

    if (isShortPrefix && hasLongBody) {
      return {
        value,
        confidence: API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_HIGH,
        reasons: [
          API_CHECK_CANDIDATE_REASONS.UNKNOWN_SHORT_PREFIX,
          ...(isMultiSegment
            ? ([
                API_CHECK_CANDIDATE_REASONS.MULTI_SEGMENT,
              ] satisfies ApiCheckCandidateReason[])
            : []),
          ...cleanupReasons,
        ],
        cleanupApplied: cleaned.cleanupApplied,
        autoPromptEligible: true,
      }
    }

    if (isMultiSegment) {
      return {
        value,
        confidence: API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_MEDIUM,
        reasons: [
          prefix.length > API_KEY_HEURISTICS.maximumShortPrefixLength
            ? API_CHECK_CANDIDATE_REASONS.UNKNOWN_LONG_PREFIX
            : API_CHECK_CANDIDATE_REASONS.MULTI_SEGMENT,
          ...cleanupReasons,
        ],
        cleanupApplied: cleaned.cleanupApplied,
        autoPromptEligible: false,
      }
    }
  }

  if (
    !hasSeparator &&
    value.length >= API_KEY_HEURISTICS.minimumUnseparatedLength &&
    isRandomLookingSegment(value)
  ) {
    return {
      value,
      confidence: API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_MEDIUM,
      reasons: [
        API_CHECK_CANDIDATE_REASONS.UNSEPARATED_LONG_TOKEN,
        ...cleanupReasons,
      ],
      cleanupApplied: cleaned.cleanupApplied,
      autoPromptEligible: false,
    }
  }

  return null
}

/**
 * Keep labeled values long enough for the legacy fallback candidate path.
 */
export function isApiKeyFallbackCandidate(value: string): boolean {
  return value.length >= API_KEY_HEURISTICS.minimumFallbackLength
}
