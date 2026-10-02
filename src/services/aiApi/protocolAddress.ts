import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification/types"
import { coerceBaseUrlToPathSuffix, normalizeHttpUrl } from "~/utils/core/url"

/**
 * Protocol address roles.
 *
 * A protocol exposes one set of operations under a version segment, so a single
 * endpoint can be named two ways and consumers disagree about which one they
 * accept:
 *
 * - {@link toProtocolRoot} — the address without that segment, for consumers
 *   that own it themselves (Claude Code and Gemini CLI append `/v1` and
 *   `/v1beta` to whatever they are configured with, and a managed channel
 *   builds its own request paths).
 * - {@link toVersionedProtocolMount} — the address including the segment, for
 *   consumers that only append an operation path (the OpenAI and Anthropic
 *   SDKs, Codex, and model discovery).
 *
 * Which trailing `vN` segment is *the* protocol version cannot be read off a
 * URL: Volcengine Ark serves OpenAI-compatible operations under `/api/v3` and
 * Anthropic-compatible ones under `/api/compatible`, and only the protocol
 * knows that `/v3` there is part of its path. Storage therefore keeps the root
 * and each consumer derives the shape it needs.
 */

/** Version segment each protocol's operations live under. */
const PROTOCOL_VERSION_SEGMENTS: Record<ApiVerificationApiType, string> = {
  openai: "v1",
  "openai-compatible": "v1",
  anthropic: "v1",
  google: "v1beta",
}

/** A path that already ends in a version segment, such as `/api/v3`. */
const VERSIONED_PATH_PATTERN = /\/v\d+(?:beta\d*)?$/i

/** Operation paths that mark a pasted endpoint rather than a base URL. */
const OPERATION_SUFFIXES: Record<ApiVerificationApiType, RegExp> = {
  openai: /\/(?:models|chat\/completions|responses)$/i,
  "openai-compatible": /\/(?:models|chat\/completions|responses)$/i,
  anthropic: /\/(?:models|messages)$/i,
  google: /\/models$/i,
}

/** Parse an http(s) address, dropping anything that is not part of it. */
const parseProtocolAddress = (input: string): URL | null => {
  const normalized = normalizeHttpUrl(input)
  if (!normalized) return null

  const url = new URL(normalized)
  url.search = ""
  url.hash = ""
  return url
}

/** Drop trailing slashes and a pasted operation path. */
const resolveBasePath = (
  apiType: ApiVerificationApiType,
  pathname: string,
): string =>
  pathname.replace(/\/+$/, "").replace(OPERATION_SUFFIXES[apiType], "")

/**
 * Reduce a protocol address to the root a version-owning consumer needs.
 *
 * Only the protocol's own version segment is dropped, so a provider-owned path
 * such as Ark's `/api/v3` survives.
 */
export function toProtocolRoot(
  apiType: ApiVerificationApiType,
  input: string,
): string | null {
  const url = parseProtocolAddress(input)
  if (!url) return null

  const versionSegment = PROTOCOL_VERSION_SEGMENTS[apiType]
  const path = resolveBasePath(apiType, url.pathname).replace(
    new RegExp(`/${versionSegment}$`, "i"),
    "",
  )
  url.pathname = path || "/"
  return url.toString().replace(/\/+$/, "")
}

/**
 * Produce the versioned mount an operation-path-only consumer needs.
 *
 * The OpenAI family accepts a complete provider prefix (`/api/v3`) as-is,
 * because appending would target a different route. The Anthropic and Google
 * protocols only define their own version segment, so an arbitrary `vN` suffix
 * is not a substitute for it.
 *
 * Volcengine Ark Coding Plan: https://docs.volcengine.com/docs/82379/2160841
 */
export function toVersionedProtocolMount(
  apiType: ApiVerificationApiType,
  input: string,
): string | null {
  const url = parseProtocolAddress(input)
  if (!url) return null

  url.pathname = resolveBasePath(apiType, url.pathname) || "/"
  const versionedPath = url.pathname.replace(/\/+$/, "")
  const baseUrl = url.toString().replace(/\/+$/, "")

  const openAiFamily = apiType === "openai" || apiType === "openai-compatible"
  if (openAiFamily && VERSIONED_PATH_PATTERN.test(versionedPath)) {
    return baseUrl
  }

  return coerceBaseUrlToPathSuffix(
    baseUrl,
    `/${PROTOCOL_VERSION_SEGMENTS[apiType]}`,
  )
}
