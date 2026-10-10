/** Magpie Web management credentials, distinct from inference gateway keys. */
export interface MagpieConfig {
  baseUrl: string
  /** The web startup link's key; MAGPIE_WEB_KEY keeps it stable across restarts. */
  webKey: string
}

export const DEFAULT_MAGPIE_CONFIG: MagpieConfig = { baseUrl: "", webKey: "" }

/** Keep reverse-proxy path prefixes while excluding login query parameters. */
export function normalizeMagpieBaseUrl(value: string): string {
  const url = new URL(value.trim())
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("Invalid Magpie management URL")
  }
  url.search = ""
  url.hash = ""
  return url.href.replace(/\/+$/, "")
}
