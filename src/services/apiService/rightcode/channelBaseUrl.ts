import type { RightCodeApiKey } from "~/services/apiService/rightcode/type"

/**
 * Builds the client-facing base URL for one Right Code channel.
 *
 * Right Code is not addressed by the bare site origin: every channel is
 * reachable under its own prefix (`/codex`, `/claude`, `/gemini`, ...) and the
 * deployment's own "copy base url" button decides whether `/v1` is appended.
 * That decision is exposed per channel as `copy_with_v1`.
 *
 * Sources, all agreeing on the same shape:
 * - the console's built-in chat client builds `${origin}${prefix}/v1/responses`,
 *   `/v1/chat/completions`, `/v1/messages` and `/v1beta/models/...`
 * - https://docs.rightapi.ai/docs/rc_extension/curl.html
 *   (`https://www.rightapi.ai/codex/v1/...`, `https://www.rightapi.ai/claude/v1/messages`)
 * - the CC Switch preset: Claude `https://www.rightapi.ai/claude`,
 *   Codex `https://www.rightapi.ai/codex/v1`
 */

const normalizePrefix = (prefix: string): string => {
  const trimmed = prefix.trim()
  if (!trimmed || trimmed === "/") return ""
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

/** OpenAI-shaped protocols need `/v1`; messages and gemini endpoints do not. */
const protocolNeedsV1 = (protocol: string | null | undefined): boolean =>
  protocol === "responses" || protocol === "completions"

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "")

export type RightCodeChannelAddressInput = {
  origin: string
  prefix: string
  /** Provider-owned copy rule; when absent the protocol decides. */
  copyWithV1?: boolean | null
  protocol?: string | null
}

/** Builds the client address a channel is reached at on one origin. */
export function resolveRightCodeChannelBaseUrl({
  origin,
  prefix,
  copyWithV1,
  protocol,
}: RightCodeChannelAddressInput): string {
  const base = `${stripTrailingSlash(origin)}${normalizePrefix(prefix)}`
  const withV1 =
    typeof copyWithV1 === "boolean" ? copyWithV1 : protocolNeedsV1(protocol)
  return withV1 ? `${base}/v1` : base
}

/**
 * Resolves the address for one inventory key.
 *
 * Channel-bound keys are addressed by their channel prefix; legacy prefix keys
 * carry their own `allowed_prefixes` list. Both forms remain routable on the
 * deployment, so the same prefix rule applies to either.
 */
export function resolveRightCodeKeyBaseUrl(input: {
  origin: string
  key: Pick<RightCodeApiKey, "allowed_prefixes">
  boundChannel?: {
    prefix: string
    copyWithV1?: boolean | null
    protocol?: string | null
  } | null
}): string | null {
  const { origin, key, boundChannel } = input
  if (boundChannel?.prefix) {
    return resolveRightCodeChannelBaseUrl({
      origin,
      prefix: boundChannel.prefix,
      copyWithV1: boundChannel.copyWithV1,
      protocol: boundChannel.protocol,
    })
  }

  const legacyPrefix = key.allowed_prefixes?.find(
    (prefix) => typeof prefix === "string" && prefix.trim(),
  )
  if (!legacyPrefix) return null

  return resolveRightCodeChannelBaseUrl({ origin, prefix: legacyPrefix })
}
