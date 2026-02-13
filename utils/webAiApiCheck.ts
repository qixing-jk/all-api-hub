import { normalizeHttpUrl } from "~/utils/url"

/**
 * Extraction result for the in-page Web AI API Check feature.
 *
 * The extractor is intentionally "best-effort" and returns candidate lists
 * (deduplicated) plus a suggested best match for each field.
 */
export type ApiCheckExtractionResult = {
  baseUrlCandidates: string[]
  apiKeyCandidates: string[]
  baseUrl: string | null
  apiKey: string | null
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

  try {
    const url = new URL(normalized)
    url.search = ""
    url.hash = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return normalized
  }
}

/**
 *
 */
function normalizeBaseUrlByStrippingPathSegment(
  baseUrl: string,
  segmentToStrip: string,
): string | null {
  const normalized = normalizeApiCheckBaseUrl(baseUrl)
  if (!normalized) return null

  try {
    const url = new URL(normalized)
    const rawSegments = url.pathname.replace(/\/+$/, "").split("/")
    const segments = rawSegments.filter(Boolean)
    const segmentIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === segmentToStrip.toLowerCase(),
    )

    if (segmentIndex >= 0) {
      const prefixSegments = segments.slice(0, segmentIndex)
      url.pathname = prefixSegments.length
        ? `/${prefixSegments.join("/")}`
        : "/"
    }

    url.search = ""
    url.hash = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return normalized
  }
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
): ApiCheckExtractionResult {
  const input = (text ?? "").trim()
  if (!input) {
    return {
      baseUrlCandidates: [],
      apiKeyCandidates: [],
      baseUrl: null,
      apiKey: null,
    }
  }

  const baseUrlCandidates: string[] = []
  const apiKeyCandidates: string[] = []

  const pushUnique = (list: string[], value: string | null) => {
    if (!value) return
    if (!list.includes(value)) {
      list.push(value)
    }
  }

  // 1) Keyword-guided URL extractions (highest confidence).
  const baseUrlPattern =
    /\b(?:base[_\s-]?url|baseURL|baseUrl|api[_\s-]?base|endpoint|proxy[_\s-]?url)\b\s*[:=]\s*([^\s'"]+)/gi
  for (const match of input.matchAll(baseUrlPattern)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    const normalized = normalizeApiCheckBaseUrl(raw)
    const openAiNormalized = normalizeOpenAiFamilyBaseUrl(raw)
    pushUnique(baseUrlCandidates, openAiNormalized)
    pushUnique(baseUrlCandidates, normalized)
  }

  // 2) Generic URL scan (fallback).
  const urlPattern = /\bhttps?:\/\/[^\s'"]+/gi
  for (const match of input.matchAll(urlPattern)) {
    const raw = trimWrappingPunctuation(match[0] ?? "")
    const normalized = normalizeApiCheckBaseUrl(raw)
    const openAiNormalized = normalizeOpenAiFamilyBaseUrl(raw)
    pushUnique(baseUrlCandidates, openAiNormalized)
    pushUnique(baseUrlCandidates, normalized)
  }

  // 3) Keyword-guided key extraction.
  const authBearerPattern = /\bAuthorization\b\s*:\s*Bearer\s+([^\s'"]+)/gi
  for (const match of input.matchAll(authBearerPattern)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw) pushUnique(apiKeyCandidates, raw)
  }

  const apiKeyPattern =
    /\b(?:api[_\s-]?key|token|access[_\s-]?token|secret)\b\s*[:=]\s*([^\s'"]+)/gi
  for (const match of input.matchAll(apiKeyPattern)) {
    const raw = trimWrappingPunctuation(match[1] ?? "")
    if (raw) pushUnique(apiKeyCandidates, raw)
  }

  // 4) Common provider token prefixes (lowest confidence, but useful when no labels exist).
  const openAiKeyPattern = /\bsk-[a-z0-9_-]{10,}\b/gi
  for (const match of input.matchAll(openAiKeyPattern)) {
    const raw = trimWrappingPunctuation(match[0] ?? "")
    if (raw) pushUnique(apiKeyCandidates, raw)
  }

  const googleKeyPattern = /\bAIza[0-9a-z_-]{10,}\b/gi
  for (const match of input.matchAll(googleKeyPattern)) {
    const raw = trimWrappingPunctuation(match[0] ?? "")
    if (raw) pushUnique(apiKeyCandidates, raw)
  }

  return {
    baseUrlCandidates,
    apiKeyCandidates,
    baseUrl: baseUrlCandidates[0] ?? null,
    apiKey: apiKeyCandidates[0] ?? null,
  }
}
