const BROWSER_FAMILIES = {
  Firefox: "firefox",
  Edge: "edge",
  Chromium: "chromium",
  Safari: "safari",
  Unknown: "unknown",
} as const

type BrowserFamily = (typeof BROWSER_FAMILIES)[keyof typeof BROWSER_FAMILIES]

const BROWSER_NAMES = {
  Edge: "Microsoft Edge",
  Opera: "Opera",
  Firefox: "Firefox",
  Chrome: "Chrome",
  Chromium: "Chromium",
  Safari: "Safari",
  Brave: "Brave",
} as const

const BROWSER_VERSION_MAX_LENGTH = 40
const BROWSER_VERSION_PATTERN = /^[0-9][a-z0-9.+_-]{0,39}$/i

/** Runtime metadata and client hints use the same bounded version contract. */
function isBrowserVersion(value: unknown): value is string {
  return typeof value === "string" && BROWSER_VERSION_PATTERN.test(value)
}

/** Labels reduced versions so they are not mistaken for exact build numbers. */
function formatBrowserVersion(name: string, version: string) {
  const reduced = /^(\d+)(?:(?:\.0){3})?$/.exec(version)
  return reduced
    ? `${name} ${reduced[1]} (major version only)`
    : `${name} ${version}`
}

/** Prefer product tokens to their embedded Chromium/WebKit compatibility tokens. */
function readUserAgentVersion(userAgent: string) {
  const candidates = [
    [BROWSER_NAMES.Edge, /\bEdg(?:A|iOS)?\/([0-9][a-z0-9.+_-]*)/i],
    [BROWSER_NAMES.Opera, /\b(?:OPR|OPiOS)\/([0-9][a-z0-9.+_-]*)/i],
    [BROWSER_NAMES.Firefox, /\b(?:Firefox|FxiOS)\/([0-9][a-z0-9.+_-]*)/i],
    [BROWSER_NAMES.Chrome, /\b(?:Chrome|CriOS)\/([0-9][a-z0-9.+_-]*)/i],
    [BROWSER_NAMES.Chromium, /\bChromium\/([0-9][a-z0-9.+_-]*)/i],
    [BROWSER_NAMES.Safari, /\bVersion\/([0-9][a-z0-9.+_-]*)[^\n]*\bSafari\//i],
  ] as const
  for (const [name, pattern] of candidates) {
    const version = pattern.exec(userAgent)?.[1]
    if (version && version.length <= BROWSER_VERSION_MAX_LENGTH)
      return { name, version }
  }
  return undefined
}

/** Reads browser name and version without including the full user agent. */
export async function getBrowserVersionInfo(): Promise<string | undefined> {
  try {
    if (
      typeof browser !== "undefined" &&
      typeof browser.runtime?.getBrowserInfo === "function"
    ) {
      const info = await browser.runtime.getBrowserInfo()
      if (
        typeof info?.name === "string" &&
        /^[a-z][a-z0-9 ._-]{0,79}$/i.test(info.name) &&
        isBrowserVersion(info.version)
      ) {
        return formatBrowserVersion(info.name, info.version)
      }
    }
  } catch {
    // Runtime metadata is optional; browser-specific fallbacks can still apply.
  }
  const fromUserAgent = readUserAgentVersion(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  )
  try {
    const hints =
      typeof navigator !== "undefined"
        ? (
            navigator as Navigator & {
              userAgentData?: {
                getHighEntropyValues?: (keys: string[]) => Promise<{
                  fullVersionList?: { brand: string; version: string }[]
                }>
              }
            }
          ).userAgentData
        : undefined
    if (hints?.getHighEntropyValues) {
      const values = await hints.getHighEntropyValues(["fullVersionList"])
      const brands = [
        ["Microsoft Edge", BROWSER_NAMES.Edge],
        ["Google Chrome", BROWSER_NAMES.Chrome],
        ["Brave", BROWSER_NAMES.Brave],
        ["Opera", BROWSER_NAMES.Opera],
        ["Chromium", BROWSER_NAMES.Chromium],
      ] as const
      for (const [brand, name] of brands) {
        if (
          fromUserAgent &&
          [
            BROWSER_NAMES.Edge,
            BROWSER_NAMES.Opera,
            BROWSER_NAMES.Firefox,
            BROWSER_NAMES.Safari,
          ].some((name) => name === fromUserAgent.name) &&
          fromUserAgent.name !== name
        )
          continue
        const version = values.fullVersionList?.find(
          (entry) => entry.brand === brand,
        )?.version
        if (isBrowserVersion(version))
          return formatBrowserVersion(name, version)
      }
    }
  } catch {
    // Client hints may be withheld; keep the version actually exposed in the UA.
  }
  return (
    fromUserAgent &&
    formatBrowserVersion(fromUserAgent.name, fromUserAgent.version)
  )
}

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

  if (normalizedUserAgent.includes("firefox/")) return BROWSER_FAMILIES.Firefox
  if (isEdgeUserAgent(ua)) return BROWSER_FAMILIES.Edge
  if (
    normalizedUserAgent.includes("chrome/") ||
    normalizedUserAgent.includes("chromium/")
  ) {
    return BROWSER_FAMILIES.Chromium
  }
  if (normalizedUserAgent.includes("safari/")) return BROWSER_FAMILIES.Safari
  return BROWSER_FAMILIES.Unknown
}
