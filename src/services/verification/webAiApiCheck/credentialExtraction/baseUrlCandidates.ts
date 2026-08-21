import { normalizeHttpUrl } from "~/utils/core/url"
import {
  normalizeUrlForBasePath,
  normalizeUrlPathname,
  transformNormalizedUrlPath,
} from "~/utils/core/urlParsing"

import {
  compareCandidates,
  pushCandidate,
  trimWrappingPunctuation,
} from "./candidateCollection"
import {
  API_CHECK_CANDIDATE_CONFIDENCES,
  API_CHECK_CANDIDATE_KINDS,
  API_CHECK_CANDIDATE_REASONS,
  type ApiCheckCandidateConfidence,
  type ApiCheckCandidateReason,
  type InternalApiCheckCandidate,
} from "./candidateContract"

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
 */
export function normalizeOpenAiFamilyBaseUrl(baseUrl: string): string | null {
  return normalizeBaseUrlByStrippingPathSegment(baseUrl, "v1")
}

/**
 * Normalize a base URL for Google/Gemini requests.
 */
export function normalizeGoogleFamilyBaseUrl(baseUrl: string): string | null {
  return normalizeBaseUrlByStrippingPathSegment(baseUrl, "v1beta")
}

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
 * Collect and rank base URL candidates from free-form text.
 */
export function extractBaseUrlCandidates(
  rawInput: string,
): InternalApiCheckCandidate[] {
  const candidates: InternalApiCheckCandidate[] = []
  let insertionOrder = 0

  const pushBaseUrlCandidate = (
    value: string | null,
    reasons: ApiCheckCandidateReason[],
    confidence: ApiCheckCandidateConfidence = API_CHECK_CANDIDATE_CONFIDENCES.STANDARD,
  ) => {
    if (!value) return
    pushCandidate(candidates, {
      value,
      kind: API_CHECK_CANDIDATE_KINDS.BASE_URL,
      confidence,
      reasons,
      autoPromptEligible: true,
      insertionOrder,
    })
    insertionOrder += 1
  }

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
      ? [
          API_CHECK_CANDIDATE_REASONS.LABELED,
          API_CHECK_CANDIDATE_REASONS.BARE_DOMAIN,
          API_CHECK_CANDIDATE_REASONS.SCHEME_ADDED,
        ]
      : [API_CHECK_CANDIDATE_REASONS.LABELED]
    const confidence: ApiCheckCandidateConfidence = isLabeledBareDomain
      ? API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_HIGH
      : API_CHECK_CANDIDATE_CONFIDENCES.STANDARD
    if (openAiNormalized !== normalized) {
      pushBaseUrlCandidate(
        openAiNormalized,
        [...labeledReasons, API_CHECK_CANDIDATE_REASONS.PATH_NORMALIZED],
        confidence,
      )
    }
    if (googleNormalized !== normalized) {
      pushBaseUrlCandidate(
        googleNormalized,
        [...labeledReasons, API_CHECK_CANDIDATE_REASONS.PATH_NORMALIZED],
        confidence,
      )
    }
    pushBaseUrlCandidate(normalized, labeledReasons, confidence)
  }

  const urlPattern = /\bhttps?:\/\/[^\s'"]+/gi
  for (const match of rawInput.matchAll(urlPattern)) {
    const raw = trimWrappingPunctuation(match[0] ?? "")
    const normalized = normalizeApiCheckBaseUrl(raw)
    const openAiNormalized = normalizeOpenAiFamilyBaseUrl(raw)
    const googleNormalized = normalizeGoogleFamilyBaseUrl(raw)
    if (openAiNormalized !== normalized) {
      pushBaseUrlCandidate(openAiNormalized, [
        API_CHECK_CANDIDATE_REASONS.GENERIC_URL,
        API_CHECK_CANDIDATE_REASONS.PATH_NORMALIZED,
      ])
    }
    if (googleNormalized !== normalized) {
      pushBaseUrlCandidate(googleNormalized, [
        API_CHECK_CANDIDATE_REASONS.GENERIC_URL,
        API_CHECK_CANDIDATE_REASONS.PATH_NORMALIZED,
      ])
    }
    pushBaseUrlCandidate(normalized, [API_CHECK_CANDIDATE_REASONS.GENERIC_URL])
  }

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
    const baseReasons: ApiCheckCandidateReason[] = [
      API_CHECK_CANDIDATE_REASONS.BARE_DOMAIN,
      API_CHECK_CANDIDATE_REASONS.SCHEME_ADDED,
    ]

    if (openAiNormalized !== normalized) {
      pushBaseUrlCandidate(
        openAiNormalized,
        [...baseReasons, API_CHECK_CANDIDATE_REASONS.PATH_NORMALIZED],
        API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_HIGH,
      )
    }
    if (googleNormalized !== normalized) {
      pushBaseUrlCandidate(
        googleNormalized,
        [...baseReasons, API_CHECK_CANDIDATE_REASONS.PATH_NORMALIZED],
        API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_HIGH,
      )
    }
    pushBaseUrlCandidate(
      normalized,
      baseReasons,
      API_CHECK_CANDIDATE_CONFIDENCES.ENHANCED_HIGH,
    )
  }

  candidates.sort(compareCandidates)
  return candidates
}
