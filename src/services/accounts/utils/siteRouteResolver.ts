import {
  getAccountSiteApiRouter,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  findAccountSiteProfileForHostname,
  getAccountSiteProductProfile,
} from "~/services/accounts/accountSiteProfile"
import { resolveStaticAccountRoutePath } from "~/services/apiAdapters/accountRoutes"
import {
  ACCOUNT_BOOTSTRAP_ROUTE_KINDS,
  type AccountBootstrapRouteKind,
  type AccountBootstrapRouteTarget,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { joinUrl } from "~/utils/core/url"

export const SITE_ROUTE_KINDS = ACCOUNT_BOOTSTRAP_ROUTE_KINDS

type SiteRouteKind = AccountBootstrapRouteKind

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
    const inferredProfile = findAccountSiteProfileForHostname(url.hostname)
    if (inferredProfile?.urls.loginOrigin) {
      return joinUrl(
        inferredProfile.urls.loginOrigin,
        getAccountSiteApiRouter(inferredProfile.siteType).loginPath,
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
 * Resolve the web page path for an account site route.
 * @param target Account site route target.
 * @param route Named route kind.
 * @returns The declared page path, or null when page navigation is unsupported.
 */
async function resolveAccountSiteRoutePath(
  target: AccountBootstrapRouteTarget,
  route: SiteRouteKind,
): Promise<string | null> {
  const accountBootstrap = getSiteTypeCapabilities(target.siteType).account
    ?.bootstrap
  return accountBootstrap?.resolveRoutePath
    ? await accountBootstrap.resolveRoutePath(target, route)
    : resolveStaticAccountRoutePath(target, route)
}

/**
 * Resolve the full web page URL for an account site route.
 * @param target Account site route target.
 * @param route Named route kind.
 * @returns The page URL, or null when page navigation is unsupported.
 */
export function resolveAccountSiteRouteUrl(
  target: AccountBootstrapRouteTarget,
  route: typeof SITE_ROUTE_KINDS.Login,
): Promise<string>
export function resolveAccountSiteRouteUrl(
  target: AccountBootstrapRouteTarget,
  route: SiteRouteKind,
): Promise<string | null>
export async function resolveAccountSiteRouteUrl(
  target: AccountBootstrapRouteTarget,
  route: SiteRouteKind,
): Promise<string | null> {
  const baseUrl = normalizeBaseUrl(target.baseUrl)
  const path = await resolveAccountSiteRoutePath(target, route)
  if (route === SITE_ROUTE_KINDS.Login && path === null) {
    throw new Error("Account site login route must be declared")
  }
  return path === null ? null : joinUrl(baseUrl, path)
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
        getAccountSiteProductProfile(siteTypeHint).urls.loginOrigin ??
        `${parsedUrl.protocol}//${parsedUrl.host}`
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
