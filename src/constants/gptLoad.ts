/**
 * gpt-load managed-site field ids and the deployment facts the editor needs.
 *
 * Upstream contract notes (verified against a live v2 control plane on
 * 2026-10-03; no OpenAPI exists, the Go route handlers are the contract):
 * - A "channel" here is a **group**: one channel id (the built-in provider
 *   driver), a set of channel-specific `params` (at minimum `base_url`), a
 *   pool of credentials (multi-key), and a replaceable model list.
 * - `GET /api/channels` returns a descriptor-driven form (`channel_id`,
 *   `param_fields`, `credential_fields`, `connection`, `capabilities`), so the
 *   provider/channel choice and its parameter form are generated from the
 *   deployment rather than hard-coded here.
 * - Writes use `Authorization: Bearer <AUTH_KEY>` (no cookie, no temp window)
 *   and most mutations require an `Idempotency-Key` (UUID v4) header.
 * - Response envelope: success `{code:0,message,data}`; failure
 *   `{code:"<UPPER_SNAKE>",message}` — the error `code` is a string.
 * - Group settings are updated in place (`PUT /api/groups/:id/settings`);
 *   models are replaced wholesale (`PUT /api/groups/:id/models`); credentials
 *   are added by import, listed masked, revealed per-row, and deleted per-row.
 */

export const GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS = {
  Name: "name",
  Provider: "channelId",
  Status: "status",
  BaseUrl: "baseUrl",
  Key: "key",
  Models: "models",
  PriceMultiplier: "priceMultiplier",
  Weight: "weight",
  CredentialCount: "credentialCount",
  TestStatus: "testStatus",
} as const

export const GPT_LOAD_MANAGED_RESOURCE_TABLE_FIELD_IDS = [
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Name,
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Provider,
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Status,
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Models,
] as const

export const GPT_LOAD_MANAGED_RESOURCE_DETAIL_FIELD_IDS = [
  ...GPT_LOAD_MANAGED_RESOURCE_TABLE_FIELD_IDS,
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Key,
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.PriceMultiplier,
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Weight,
] as const

/**
 * Fallback channel id for a source that matches no known provider endpoint.
 * `openai_compatible` is the OpenAI-compatible surface and accepts a `base_url`
 * param, so an arbitrary relay imports in one step (the OpenAI-compatible
 * module requires `base_url`).
 */
export const GPT_LOAD_DEFAULT_CHANNEL_ID = "openai_compatible"

/**
 * Well-known channel ids whose `base_url` param sits on a first-party endpoint,
 * keyed so an import can prefill the channel id from a source address.
 *
 * gpt-load ships 35 built-in channel ids; only the ones with a static
 * first-party API root are listed, and only to recognise a source account.
 * Anything else falls back to `openai_compatible` with the source address as
 * the `base_url` override. Roots are trimmed, lower-cased, and compared with
 * the most specific match winning.
 */
const GPT_LOAD_FIRST_PARTY_CHANNEL_BASE_URLS: Readonly<
  Record<string, readonly string[]>
> = {
  openai: ["https://api.openai.com/v1"],
  anthropic: ["https://api.anthropic.com"],
  gemini: ["https://generativelanguage.googleapis.com"],
  deepseek: ["https://api.deepseek.com/v1", "https://api.deepseek.com"],
  moonshotai: ["https://api.moonshot.ai/v1"],
  siliconflow: ["https://api.siliconflow.cn/v1"],
  zhipuai: ["https://open.bigmodel.cn/api/paas/v4"],
  alibaba: [
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  ],
  volcengine: ["https://ark.cn-beijing.volces.com/api/v3"],
  openrouter: ["https://openrouter.ai/api/v1"],
  groq: ["https://api.groq.com/openai/v1"],
  xai: ["https://api.x.ai/v1"],
  mistral: ["https://api.mistral.ai/v1"],
  cerebras: ["https://api.cerebras.ai/v1"],
  nebius: ["https://api.studio.nebius.ai/v1"],
  huggingface: ["https://router.huggingface.co/v1"],
  cohere: ["https://api.cohere.com/v1"],
}

/** Normalizes a URL for address comparison: trimmed, lower-cased, no trailing slash. */
export const normalizeGptLoadComparableUrl = (value: string): string =>
  value.trim().toLowerCase().replace(/\/+$/, "")

/**
 * Resolves the channel id whose first-party endpoint owns the supplied URL, or
 * null when the address belongs to no known channel (an arbitrary relay).
 * The most specific match wins so a provider root never shadows a nested one.
 */
export function resolveGptLoadFirstPartyChannel(
  baseUrl: string,
): string | null {
  const candidate = normalizeGptLoadComparableUrl(baseUrl)
  if (!candidate) return null

  let best: { channelId: string; length: number } | null = null
  for (const [channelId, roots] of Object.entries(
    GPT_LOAD_FIRST_PARTY_CHANNEL_BASE_URLS,
  )) {
    for (const root of roots) {
      const normalizedRoot = normalizeGptLoadComparableUrl(root)
      if (
        candidate !== normalizedRoot &&
        !candidate.startsWith(`${normalizedRoot}/`)
      ) {
        continue
      }
      if (!best || normalizedRoot.length > best.length) {
        best = { channelId, length: normalizedRoot.length }
      }
    }
  }
  return best?.channelId ?? null
}
