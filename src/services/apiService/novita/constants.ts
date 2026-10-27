/**
 * Novita AI protocol constants.
 *
 * Novita (https://novita.ai) serves its key-authenticated account OpenAPI on
 * https://api.novita.ai/openapi (Bearer `sk_` API key) — distinct from the
 * console-session API on api-server.novita.ai. The verified console bearer
 * is saved for independent management requests; it is never an inference key.
 * Verified live on 2026-10-27; docs: https://docs.novita.ai/llms.txt
 */

export const NOVITA_CONSOLE_IDENTITY_URL =
  "https://api-server.novita.ai/v1/user/info"

/** Local credential discriminator: console tokens themselves are opaque. */
export const NOVITA_CONSOLE_CREDENTIAL_PREFIX = "novita-console:"

const PAIRED_CREDENTIAL_PREFIX = "novita-credentials:"
export type NovitaCredentials = { apiKey: string; consoleToken: string }

/** Decodes the provider-owned credential envelope; legacy single credentials stay valid. */
export function parseNovitaCredentials(
  value: string | undefined,
): NovitaCredentials {
  const credential = value?.trim() ?? ""
  if (credential.startsWith(PAIRED_CREDENTIAL_PREFIX)) {
    try {
      const parsed: unknown = JSON.parse(
        credential.slice(PAIRED_CREDENTIAL_PREFIX.length),
      )
      if (
        parsed &&
        typeof parsed === "object" &&
        "apiKey" in parsed &&
        "consoleToken" in parsed &&
        typeof parsed.apiKey === "string" &&
        typeof parsed.consoleToken === "string"
      ) {
        return {
          apiKey: parsed.apiKey.trim(),
          consoleToken: parsed.consoleToken.trim(),
        }
      }
    } catch {
      /* Invalid envelopes are not sent as bearer tokens. */
    }
    return { apiKey: "", consoleToken: "" }
  }
  return credential.startsWith(NOVITA_CONSOLE_CREDENTIAL_PREFIX)
    ? {
        apiKey: "",
        consoleToken: credential
          .slice(NOVITA_CONSOLE_CREDENTIAL_PREFIX.length)
          .trim(),
      }
    : { apiKey: credential, consoleToken: "" }
}

/** Uses the existing atomic account credential store, backup and sync paths. */
export function encodeNovitaCredentials({
  apiKey,
  consoleToken,
}: NovitaCredentials): string {
  apiKey = apiKey.trim()
  consoleToken = consoleToken.trim()
  if (!apiKey)
    return consoleToken ? encodeNovitaConsoleCredential(consoleToken) : ""
  if (!consoleToken) return apiKey
  return PAIRED_CREDENTIAL_PREFIX + JSON.stringify({ apiKey, consoleToken })
}

export type NovitaCredentialMode = "console" | "api-key"

export const encodeNovitaConsoleCredential = (token: string) =>
  `${NOVITA_CONSOLE_CREDENTIAL_PREFIX}${token}`

export const isNovitaConsoleCredential = (credential: string | undefined) =>
  Boolean(parseNovitaCredentials(credential).consoleToken)

export const NOVITA_OPENAPI_ENDPOINTS = {
  /** Returns the account identity (email, uid, uuid). */
  userInfo: "/v1/user/info",
  /** Console "Credits Remaining" and its cash/credit parts. */
  balanceDetail: "/v1/billing/balance/detail",
  /** Masked key inventory with model/IP access-policy summaries. */
  keys: "/v2/user/key",
} as const

/**
 * Monetary amounts are 1/10000 USD strings: `10000` = $1.00.
 * https://docs.novita.ai/api-reference/basic-get-user-balance.md
 */
export const NOVITA_AMOUNTS_PER_USD = 10_000

/** Converts one native 1/10000 USD amount string into USD. */
export function novitaAmountToUsd(value: string): number {
  return value.length ? Number(value) / NOVITA_AMOUNTS_PER_USD : Number.NaN
}
