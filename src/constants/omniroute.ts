/**
 * OmniRoute managed-site field ids and the deployment facts the editor needs.
 *
 * Upstream contract notes (verified against a live deployment of the
 * `release/v3.8.51` line on 2026-09-29):
 * - A "channel" is a provider connection. It stores a credential, an optional
 *   connection-level `providerSpecificData.baseUrl` override, and a single
 *   `defaultModel`. Models are not a connection property: the gateway resolves
 *   them from its provider catalogue plus gateway-level aliases/disabled lists,
 *   so this integration exposes no per-channel model list.
 * - `POST /api/providers` accepts `provider`, `apiKey`, `name`, `priority`,
 *   `globalPriority`, `defaultModel`, `testStatus`, and `providerSpecificData`.
 *   The repository's `docs/openapi.yaml` documents a `url` field that the route
 *   handler does not accept, so only the handler is authoritative.
 *   https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/shared/validation/schemas/provider.ts
 */

export const OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS = {
  Name: "name",
  Provider: "provider",
  Status: "status",
  BaseUrl: "baseURL",
  Key: "key",
  DefaultModel: "defaultModel",
  Prefix: "prefix",
  Priority: "priority",
  TestStatus: "testStatus",
  LastError: "lastError",
} as const

export const OMNIROUTE_MANAGED_RESOURCE_TABLE_FIELD_IDS = [
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Name,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Provider,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Status,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.DefaultModel,
] as const

export const OMNIROUTE_MANAGED_RESOURCE_DETAIL_FIELD_IDS = [
  ...OMNIROUTE_MANAGED_RESOURCE_TABLE_FIELD_IDS,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Key,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Prefix,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Priority,
  // The gateway's own connection test: read-only, and the only signal that
  // separates a working channel from one the gateway cannot reach. `lastError`
  // is the gateway's own diagnosis of that failure, and it is already sanitized
  // upstream — `sanitizeErrorMessage` strips credential assignments, provider
  // token formats, PEM blocks, stack frames and absolute paths from every
  // message the gateway surfaces.
  // https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/docs/security/ERROR_SANITIZATION.md
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.TestStatus,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.LastError,
] as const

/**
 * `testStatus` values the gateway writes on a connection: `active` once its own
 * test succeeded, `error` after a failure (with `lastError` filled in),
 * `unavailable` when the provider cannot be tested at all, and `unknown` before
 * the first test. Any value outside this set is shown as the gateway reported it.
 * https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/app/api/providers/[id]/test/route.ts
 */
export const OMNIROUTE_CONNECTION_TEST_STATUSES = {
  Active: "active",
  Error: "error",
  Unavailable: "unavailable",
  Unknown: "unknown",
} as const

/**
 * The gateway ranks a provider's connections by `priority` ascending and
 * auto-assigns `MAX(priority) + 1` when a connection is created, so the accepted
 * range is the update route's (`1..100_000`).
 * https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/shared/validation/schemas/provider.ts
 */
export const OMNIROUTE_PRIORITY_RANGE = { min: 1, max: 100_000 } as const

/**
 * Scoped access tokens are issued as `oma_live_…`; the code constant upstream is
 * `oma_`. Bearer-only, so an `oma_` token works from any origin.
 * https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/server/authz/accessTokenAuth.ts
 */
export const OMNIROUTE_ACCESS_TOKEN_PREFIX = "oma_"

/** Returns whether the value looks like a scoped access token rather than a password. */
export function isOmniRouteAccessToken(value: string): boolean {
  return value.trim().startsWith(OMNIROUTE_ACCESS_TOKEN_PREFIX)
}

/**
 * Fallback built-in provider for a source that matches no known provider
 * endpoint. `openai` is the OpenAI-compatible surface, and the connection-level
 * `providerSpecificData.baseUrl` override wins over the provider's static
 * configuration (`open-sse/executors/base.ts` → `resolveBaseUrl`), so an
 * arbitrary relay can be imported in one step.
 */
export const OMNIROUTE_DEFAULT_BUILTIN_PROVIDER = "openai"

/**
 * Public API roots of well-known built-in providers, keyed by the gateway's
 * provider id.
 *
 * The gateway exposes no provider-catalogue route (its dashboard imports the
 * constants directly), so the editor cannot ask the deployment which provider
 * ids exist. This table exists only to recognise a source account whose address
 * is a known first-party endpoint, so the import can select that provider
 * instead of overriding `openai`'s endpoint — providers with their own request
 * shaping (Anthropic, Gemini) are not interchangeable with an OpenAI-compatible
 * override. Ids and addresses taken from the upstream registry:
 * https://github.com/diegosouzapw/OmniRoute/tree/release/v3.8.51/open-sse/config/providers/registry
 */
export const OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS: Readonly<
  Record<string, readonly string[]>
> = {
  openai: ["https://api.openai.com/v1"],
  anthropic: ["https://api.anthropic.com"],
  gemini: ["https://generativelanguage.googleapis.com"],
  deepseek: ["https://api.deepseek.com/v1", "https://api.deepseek.com"],
  groq: ["https://api.groq.com/openai/v1"],
  mistral: ["https://api.mistral.ai/v1"],
  moonshot: ["https://api.moonshot.ai/v1"],
  glm: ["https://api.z.ai/api/paas/v4", "https://api.z.ai/api/coding/paas/v4"],
  xai: ["https://api.x.ai/v1"],
  openrouter: ["https://openrouter.ai/api/v1"],
  minimax: ["https://api.minimax.io/v1"],
  alibaba: [
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  ],
}

/** Normalizes a URL for address comparison: trimmed, lower-cased, no trailing slash. */
export const normalizeOmniRouteComparableUrl = (value: string): string =>
  value.trim().toLowerCase().replace(/\/+$/, "")

/**
 * Resolves the built-in provider id whose endpoint owns the supplied URL, or
 * null when the address belongs to no known provider (an arbitrary relay).
 * The most specific match wins so a provider root never shadows a nested one.
 */
export function resolveOmniRouteBuiltinProvider(
  baseUrl: string,
): string | null {
  const candidate = normalizeOmniRouteComparableUrl(baseUrl)
  if (!candidate) return null

  let best: { providerId: string; length: number } | null = null
  for (const [providerId, roots] of Object.entries(
    OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS,
  )) {
    for (const root of roots) {
      const normalizedRoot = normalizeOmniRouteComparableUrl(root)
      if (
        candidate !== normalizedRoot &&
        !candidate.startsWith(`${normalizedRoot}/`)
      ) {
        continue
      }
      if (!best || normalizedRoot.length > best.length) {
        best = { providerId, length: normalizedRoot.length }
      }
    }
  }
  return best?.providerId ?? null
}
