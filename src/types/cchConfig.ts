/**
 * Claude Code Hub configuration stored in user preferences.
 */
export interface CCHConfig {
  /**
   * CCH API base URL, e.g. https://cch.skydog.cc.cd
   */
  baseUrl: string
  /**
   * CCH auth token for Authorization header (Bearer token)
   */
  authToken: string
}

export const DEFAULT_CCH_CONFIG: CCHConfig = {
  baseUrl: "https://cch.skydog.cc.cd",
  authToken: "",
}
