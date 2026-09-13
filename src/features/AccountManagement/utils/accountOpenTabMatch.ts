import { isSameAccountSiteOrigin } from "~/services/accounts/accountSiteProfile/urls"
import type { DisplaySiteData } from "~/types"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

/** Matches a configured page without treating its entire shared host as related. */
function matchesConfiguredPage(tab: URL, configuredUrl: string | undefined) {
  const page = tryParseHttpUrl(configuredUrl)
  if (!page || page.origin !== tab.origin) return false

  const normalizePath = (path: string) => path.replace(/\/+$/, "")
  if (normalizePath(page.pathname) !== normalizePath(tab.pathname)) return false

  // Configured parameters and hash routes may identify a tenant or a specific page.
  // Extra tab parameters (for example, tracking parameters) do not change that match.
  for (const key of new Set(page.searchParams.keys())) {
    const expected = page.searchParams.getAll(key).sort()
    const actual = tab.searchParams.getAll(key).sort()
    if (
      expected.length !== actual.length ||
      expected.some((value, index) => value !== actual[index])
    )
      return false
  }
  return !page.hash || page.hash === tab.hash
}

/** Recognizes account sites and explicitly configured related pages, never titles. */
export function isAccountRelatedTab(
  account: Pick<DisplaySiteData, "baseUrl" | "siteType" | "checkIn">,
  tabUrl: string | undefined,
): boolean {
  const tab = tryParseHttpUrl(tabUrl)
  if (!tab) return false

  return (
    isSameAccountSiteOrigin(
      { url: account.baseUrl, siteType: account.siteType },
      { url: tab.href },
    ) ||
    matchesConfiguredPage(tab, account.checkIn?.customCheckIn?.url) ||
    matchesConfiguredPage(tab, account.checkIn?.customCheckIn?.redeemUrl)
  )
}
