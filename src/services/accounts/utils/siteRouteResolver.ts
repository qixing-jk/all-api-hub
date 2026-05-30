import {
  getAccountSiteApiRouter,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { joinUrl } from "~/utils/core/url"

export const SITE_ROUTE_KINDS = {
  Login: "login",
  Usage: "usage",
  CheckIn: "checkIn",
  AdminCredentials: "adminCredentials",
  Redeem: "redeem",
  SiteAnnouncements: "siteAnnouncements",
} as const

export type SiteRouteKind =
  (typeof SITE_ROUTE_KINDS)[keyof typeof SITE_ROUTE_KINDS]

type RouteTarget = {
  baseUrl: string
  siteType: AccountSiteType
}

type SiteStatusPayload = {
  success?: boolean
  data?: {
    theme?: string
  } | null
}

const NEW_API_FRONTEND_THEMES = {
  Default: "default",
} as const

const NEW_API_STATUS_ENDPOINT = "/api/status"
const SITE_ANNOUNCEMENTS_ROUTE_KIND = SITE_ROUTE_KINDS.SiteAnnouncements

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

export const SITE_ROUTE_THEME_CACHE_TTL_MS = 5 * 60 * 1000

const themeCache = new Map<string, { fetchedAt: number; theme?: string }>()

/**
 * Normalize a configured account site URL so resolved route URLs are stable.
 * @param baseUrl Account site base URL.
 * @returns Base URL without trailing slashes.
 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
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
    const response = await fetch(
      joinUrl(normalizedBaseUrl, NEW_API_STATUS_ENDPOINT),
    )
    if (!response.ok) {
      themeCache.set(normalizedBaseUrl, { fetchedAt: now })
      return undefined
    }

    const payload = (await response.json()) as SiteStatusPayload
    const theme =
      payload && typeof payload.data?.theme === "string"
        ? payload.data.theme
        : undefined
    themeCache.set(normalizedBaseUrl, { fetchedAt: now, theme })
    return theme
  } catch {
    themeCache.set(normalizedBaseUrl, { fetchedAt: now })
    return undefined
  }
}

/**
 * Resolve the web page path for an account site route.
 * @param target Account site route target.
 * @param route Named route kind.
 * @returns Route path for the target site and frontend theme.
 */
export async function resolveAccountSiteRoutePath(
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
 * Clear the in-memory theme cache between unit tests.
 */
export function clearSiteRouteThemeCacheForTests() {
  themeCache.clear()
}
