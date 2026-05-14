type BrowserFamily = "firefox" | "edge" | "chromium" | "safari" | "unknown"

/**
 * Detects Microsoft Edge browsers by inspecting the user-agent string.
 */
function isEdgeUserAgent(userAgent: string): boolean {
  return (
    /EdgA\//.test(userAgent) ||
    /EdgiOS\//.test(userAgent) ||
    /Edg\//.test(userAgent)
  )
}

/**
 * Classifies a user-agent string into a coarse browser family.
 * @param userAgent Optional user-agent string to inspect. Defaults to navigator.userAgent.
 * @returns The detected browser family, or "unknown" when no known family matches.
 */
export function detectBrowserFamily(userAgent?: string): BrowserFamily {
  const ua =
    userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")
  const normalizedUserAgent = ua.toLowerCase()

  if (normalizedUserAgent.includes("firefox/")) return "firefox"
  if (isEdgeUserAgent(ua)) return "edge"
  if (
    normalizedUserAgent.includes("chrome/") ||
    normalizedUserAgent.includes("chromium/")
  ) {
    return "chromium"
  }
  if (normalizedUserAgent.includes("safari/")) return "safari"
  return "unknown"
}
