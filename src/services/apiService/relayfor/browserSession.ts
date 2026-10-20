const RELAYFOR_TOKEN_STORAGE_KEY = "relayfor_token"
const RELAYFOR_LEGACY_TOKEN_STORAGE_KEY = "topublic_proxy_token"

const getString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

/** Reads the console's bearer token from localStorage without generating or renewing credentials. */
export function readRelayForBrowserToken(): string | null {
  const token = getString(localStorage.getItem(RELAYFOR_TOKEN_STORAGE_KEY))
  if (token) return token
  const legacyToken = getString(
    localStorage.getItem(RELAYFOR_LEGACY_TOKEN_STORAGE_KEY),
  )
  return legacyToken || null
}
