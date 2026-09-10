import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"

import { resolveStaticAccountRoutePath } from "../accountRoutes"
import {
  ACCOUNT_BOOTSTRAP_ROUTE_KINDS as SITE_ROUTE_KINDS,
  type AccountBootstrapCapability,
  type AccountBootstrapRouteTarget,
  type AccountBootstrapRouteKind as SiteRouteKind,
} from "../contracts/accountBootstrap"

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, "")

const NEW_API_FRONTEND_THEMES = {
  Default: "default",
} as const

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
 * Fetch the current New API frontend theme, cached briefly per base URL.
 * @param baseUrl New API deployment base URL.
 * @param accountBootstrap Account bootstrap status capability.
 * @returns Frontend theme identifier when available.
 */
async function fetchNewApiFrontendTheme(
  baseUrl: string,
  accountBootstrap: Pick<AccountBootstrapCapability, "fetchSiteStatus">,
): Promise<string | undefined> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const cached = themeCache.get(normalizedBaseUrl)
  const now = Date.now()
  if (cached && now - cached.fetchedAt < SITE_ROUTE_THEME_CACHE_TTL_MS) {
    return cached.theme
  }

  try {
    const statusInfo = await accountBootstrap.fetchSiteStatus({
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

/** Resolves New API-family routes, including the New API default frontend theme. */
export async function resolveNewApiAccountRoutePath(
  target: AccountBootstrapRouteTarget,
  route: SiteRouteKind,
  accountBootstrap: Pick<AccountBootstrapCapability, "fetchSiteStatus">,
): Promise<string | null> {
  const staticPath = resolveStaticAccountRoutePath(target, route)
  if (
    staticPath === null ||
    target.siteType !== SITE_TYPES.NEW_API ||
    route === SITE_ANNOUNCEMENTS_ROUTE_KIND
  ) {
    return staticPath
  }

  const theme = await fetchNewApiFrontendTheme(target.baseUrl, accountBootstrap)
  if (theme === NEW_API_FRONTEND_THEMES.Default) {
    return NEW_API_DEFAULT_THEME_ROUTE_PATHS[route] ?? staticPath
  }

  return staticPath
}

/**
 * Clear the in-memory theme cache between unit tests.
 */
export function clearSiteRouteThemeCacheForTests() {
  themeCache.clear()
}
