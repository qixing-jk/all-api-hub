import {
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_WEB_ORIGIN,
  getAccountSiteApiRouter,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"
import { joinUrl } from "~/utils/core/url"

export const SITE_ROUTE_KINDS = {
  Login: "login",
  Usage: "usage",
  CheckIn: "checkIn",
  AdminCredentials: "adminCredentials",
  Redeem: "redeem",
  SiteAnnouncements: "siteAnnouncements",
} as const

type SiteRouteKind = (typeof SITE_ROUTE_KINDS)[keyof typeof SITE_ROUTE_KINDS]

type RouteTarget = {
  baseUrl: string
  siteType: AccountSiteType
}

const NEW_API_FRONTEND_THEMES = {
  Default: "default",
} as const

const SITE_ANNOUNCEMENTS_ROUTE_KIND = SITE_ROUTE_KINDS.SiteAnnouncements
const AIHUBMIX_HOSTNAME_SET: ReadonlySet<string> = new Set(AIHUBMIX_HOSTNAMES)

const NEW_API_DEFAULT_THEME_ROUTE_PATHS: Record<
  Exclude<SiteRouteKind, typeof SITE_ANNOUNCEMENTS_ROUTE_KIND>,
  string
> = {
  [SITE_ROUTE_KINDS.Login]: "/sign-in",
  [SITE_ROUTE_KINDS.Usage]: "/usage-logs",
  [SITE_ROUTE_KINDS.CheckIn]: "/profile",
  [SITE_ROUTE_KINDS.AdminCredentials]: "/profile",
  [SITE_ROUTE_KINDS.Redeem]: "/wallet",
}

const SITE_ROUTE_THEME_CACHE_TTL_MS = 5 * 60 * 1000
const SITE_ROUTE_THEME_CACHE_MAX_ENTRIES = 100

const themeCache = new Map<string, { fetchedAt: number; theme?: string }>()

/**
 * Store a New API theme probe result while bounding the short-lived cache.
 * @param baseUrl Normalized account site base URL.
 * @param value Cached theme probe result.
 * @param value.fetchedAt Timestamp when the theme was fetched.
 * @param value.theme Optional detected New API theme name.
 */
function setCachedTheme(
  baseUrl: string,
  value: { fetchedAt: number; theme?: string },
) {
  themeCache.set(baseUrl, value)

  while (themeCache.size > SITE_ROUTE_THEME_CACHE_MAX_ENTRIES) {
    const oldestKey = themeCache.keys().next().value
    if (typeof oldestKey !== "string") return
    themeCache.delete(oldestKey)
  }
}

/**
 * Normalize a configured account site URL so resolved route URLs are stable.
 * @param baseUrl Account site base URL.
 * @returns Base URL without trailing slashes.
 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

/**
 * Resolve the best-effort login URL when no site type hint is available.
 * @param siteUrl Site URL provided by the caller.
 * @returns A normalized login page URL or the original URL when parsing fails.
 */
export function getBestEffortLoginUrl(siteUrl: string): string {
  try {
    const url = new URL(siteUrl)
    if (AIHUBMIX_HOSTNAME_SET.has(url.hostname.toLowerCase())) {
      return joinUrl(
        AIHUBMIX_WEB_ORIGIN,
        getAccountSiteApiRouter(SITE_TYPES.AIHUBMIX).loginPath,
      )
    }

    return joinUrl(
      `${url.protocol}//${url.host}`,
      getAccountSiteApiRouter(SITE_TYPES.UNKNOWN).loginPath,
    )
  } catch {
    return siteUrl
  }
}

/**
 * Resolve the legacy/static route path for a supported account site type.
 * @param siteType Account site type.
 * @param route Named route kind.
 * @returns Static path from the site route configuration.
 */
function getStaticRoutePath(siteType: AccountSiteType, route: SiteRouteKind) {
  const config = getAccountSiteApiRouter(siteType)
  switch (route) {
    case SITE_ROUTE_KINDS.Login:
      return config.loginPath
    case SITE_ROUTE_KINDS.Usage:
      return config.usagePath
    case SITE_ROUTE_KINDS.CheckIn:
      return config.checkInPath
    case SITE_ROUTE_KINDS.AdminCredentials:
      return config.adminCredentialsPath
    case SITE_ROUTE_KINDS.Redeem:
      return config.redeemPath
    case SITE_ROUTE_KINDS.SiteAnnouncements:
      return config.siteAnnouncementsPath
  }
}

/**
 * Fetch the current New API frontend theme, cached briefly per base URL.
 * @param baseUrl New API deployment base URL.
 * @returns Frontend theme identifier when available.
 */
async function fetchNewApiFrontendTheme(
  baseUrl: string,
): Promise<string | undefined> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const cached = themeCache.get(normalizedBaseUrl)
  const now = Date.now()
  if (cached && now - cached.fetchedAt < SITE_ROUTE_THEME_CACHE_TTL_MS) {
    return cached.theme
  }

  try {
    const statusInfo = await getApiService(SITE_TYPES.NEW_API).fetchSiteStatus({
      baseUrl: normalizedBaseUrl,
      auth: { authType: AuthTypeEnum.None },
    })
    const theme =
      typeof statusInfo?.theme === "string" ? statusInfo.theme : undefined
    setCachedTheme(normalizedBaseUrl, { fetchedAt: now, theme })
    return theme
  } catch {
    setCachedTheme(normalizedBaseUrl, { fetchedAt: now })
    return undefined
  }
}

/**
 * Resolve the web page path for an account site route.
 * @param target Account site route target.
 * @param route Named route kind.
 * @returns Route path for the target site and frontend theme.
 */
async function resolveAccountSiteRoutePath(
  target: Pick<RouteTarget, "baseUrl" | "siteType">,
  route: SiteRouteKind,
): Promise<string> {
  const staticPath = getStaticRoutePath(target.siteType, route)

  if (
    target.siteType !== SITE_TYPES.NEW_API ||
    route === SITE_ANNOUNCEMENTS_ROUTE_KIND
  ) {
    return staticPath
  }

  const theme = await fetchNewApiFrontendTheme(target.baseUrl)
  if (theme === NEW_API_FRONTEND_THEMES.Default) {
    return NEW_API_DEFAULT_THEME_ROUTE_PATHS[route]
  }

  return staticPath
}

/**
 * Resolve the full web page URL for an account site route.
 * @param target Account site route target.
 * @param route Named route kind.
 * @returns Full URL for the target site and route.
 */
export async function resolveAccountSiteRouteUrl(
  target: Pick<RouteTarget, "baseUrl" | "siteType">,
  route: SiteRouteKind,
): Promise<string> {
  const baseUrl = normalizeBaseUrl(target.baseUrl)
  const path = await resolveAccountSiteRoutePath(target, route)
  return joinUrl(baseUrl, path)
}

/**
 * Resolve the login page URL for a site with optional site type awareness.
 * @param siteUrl Site URL provided by the caller.
 * @param siteTypeHint Already-known site type from the caller.
 * @returns Full URL for the site's login page, or a best-effort fallback.
 */
export async function resolveAccountSiteLoginUrl(
  siteUrl: string,
  siteTypeHint?: AccountSiteType,
): Promise<string> {
  try {
    const parsedUrl = new URL(siteUrl)
    if (siteTypeHint && siteTypeHint !== SITE_TYPES.UNKNOWN) {
      const baseUrl =
        siteTypeHint === SITE_TYPES.AIHUBMIX
          ? AIHUBMIX_WEB_ORIGIN
          : `${parsedUrl.protocol}//${parsedUrl.host}`
      return resolveAccountSiteRouteUrl(
        {
          baseUrl,
          siteType: siteTypeHint,
        },
        SITE_ROUTE_KINDS.Login,
      )
    }

    return getBestEffortLoginUrl(siteUrl)
  } catch {
    return getBestEffortLoginUrl(siteUrl)
  }
}

/**
 * Clear the in-memory theme cache between unit tests.
 */
export function clearSiteRouteThemeCacheForTests() {
  themeCache.clear()
}
