import { SITE_TYPES } from "~/constants/siteType"
import {
  resolveRixApiMajorVersion,
  RIX_API_V6_MIN_MAJOR_VERSION,
} from "~/services/apiService/newApiFamily/variants/rixApiDialects"
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

const SITE_ROUTE_FACTS_CACHE_TTL_MS = 5 * 60 * 1000
const SITE_ROUTE_FACTS_CACHE_MAX_ENTRIES = 100

/**
 * Rix API console route paths for its 6.x generation.
 *
 * The 6.x console left the One/New API-style paths the account definition still
 * declares for older deployments (`/log`, `/panel`, `/topup`, `/login`).
 * Verified 2026-09-26 on platform.ephone.ai and the vendor demo
 * platform.rixapi.com, whose shells both route `/dashboard`, `/logs`,
 * `/token/`, `/billing/`, `/profile` and `/sign-in`.
 * https://github.com/RixAPI/Rix-API
 */
const RIX_API_V6_ROUTE_PATHS: Record<
  Exclude<SiteRouteKind, typeof SITE_ANNOUNCEMENTS_ROUTE_KIND>,
  string
> = {
  [SITE_ROUTE_KINDS.Login]: "/sign-in",
  [SITE_ROUTE_KINDS.Usage]: "/logs",
  [SITE_ROUTE_KINDS.CheckIn]: "/profile",
  [SITE_ROUTE_KINDS.AdminCredentials]: "/profile",
  [SITE_ROUTE_KINDS.Redeem]: "/billing",
}

interface CachedBootstrapRouteFacts {
  fetchedAt: number
  theme?: string
}

const bootstrapRouteFactsCache = new Map<string, CachedBootstrapRouteFacts>()

/**
 * Store a bootstrap-facts probe result while bounding the short-lived cache.
 * @param baseUrl Normalized account site base URL.
 * @param value Cached probe result.
 */
function setCachedBootstrapRouteFacts(
  baseUrl: string,
  value: CachedBootstrapRouteFacts,
) {
  bootstrapRouteFactsCache.set(baseUrl, value)

  while (bootstrapRouteFactsCache.size > SITE_ROUTE_FACTS_CACHE_MAX_ENTRIES) {
    const oldestKey = bootstrapRouteFactsCache.keys().next().value
    if (typeof oldestKey !== "string") return
    bootstrapRouteFactsCache.delete(oldestKey)
  }
}

/**
 * Fetch the bootstrap facts route selection depends on, cached briefly per base
 * URL: the New API frontend theme.
 * @param baseUrl New API-family deployment base URL.
 * @param accountBootstrap Account bootstrap facts capability.
 * @returns Cached facts, with the fields a deployment did not report absent.
 */
async function fetchCachedBootstrapRouteFacts(
  baseUrl: string,
  accountBootstrap: Pick<AccountBootstrapCapability, "loadBootstrapFacts">,
): Promise<CachedBootstrapRouteFacts> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const cached = bootstrapRouteFactsCache.get(normalizedBaseUrl)
  const now = Date.now()
  if (cached && now - cached.fetchedAt < SITE_ROUTE_FACTS_CACHE_TTL_MS) {
    return cached
  }

  try {
    const facts = await accountBootstrap.loadBootstrapFacts({
      baseUrl: normalizedBaseUrl,
      auth: { authType: AuthTypeEnum.None },
    })
    const probedFacts: CachedBootstrapRouteFacts = {
      fetchedAt: now,
      ...(typeof facts?.frontendTheme === "string"
        ? { theme: facts.frontendTheme }
        : {}),
    }
    setCachedBootstrapRouteFacts(normalizedBaseUrl, probedFacts)
    return probedFacts
  } catch {
    const failedProbeFacts: CachedBootstrapRouteFacts = { fetchedAt: now }
    setCachedBootstrapRouteFacts(normalizedBaseUrl, failedProbeFacts)
    return failedProbeFacts
  }
}

/**
 * Resolves New API-family routes, including the New API default frontend theme
 * and the Rix API console generation.
 */
export async function resolveNewApiAccountRoutePath(
  target: AccountBootstrapRouteTarget,
  route: SiteRouteKind,
  accountBootstrap: Pick<AccountBootstrapCapability, "loadBootstrapFacts">,
): Promise<string | null> {
  const staticPath = resolveStaticAccountRoutePath(target, route)
  if (staticPath === null || route === SITE_ANNOUNCEMENTS_ROUTE_KIND) {
    return staticPath
  }

  const resolvesRixApiConsole = target.siteType === SITE_TYPES.RIX_API
  const resolvesNewApiTheme = target.siteType === SITE_TYPES.NEW_API
  if (!resolvesRixApiConsole && !resolvesNewApiTheme) {
    return staticPath
  }

  if (resolvesRixApiConsole) {
    let majorVersion = resolveRixApiMajorVersion(target.baseUrl)
    if (majorVersion === undefined) {
      await fetchCachedBootstrapRouteFacts(target.baseUrl, accountBootstrap)
      majorVersion = resolveRixApiMajorVersion(target.baseUrl)
    }
    // An absent or unparsable core version stays on the paths the account
    // definition declares, which are the older generation's console.
    return (majorVersion ?? 0) >= RIX_API_V6_MIN_MAJOR_VERSION
      ? RIX_API_V6_ROUTE_PATHS[route] ?? staticPath
      : staticPath
  }

  const facts = await fetchCachedBootstrapRouteFacts(
    target.baseUrl,
    accountBootstrap,
  )

  if (facts.theme === NEW_API_FRONTEND_THEMES.Default) {
    return NEW_API_DEFAULT_THEME_ROUTE_PATHS[route] ?? staticPath
  }

  return staticPath
}

/**
 * Clear the in-memory bootstrap-facts cache between unit tests.
 */
export function clearSiteRouteFactsCacheForTests() {
  bootstrapRouteFactsCache.clear()
}
