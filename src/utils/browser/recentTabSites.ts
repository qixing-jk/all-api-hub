import { tryParseHttpUrl, tryParseUrl } from "~/utils/core/urlParsing"

export const BROWSER_TAB_SITE_URL_MODES = {
  ORIGIN: "origin",
  PAGE: "page",
} as const

export type BrowserTabSiteUrlMode =
  (typeof BROWSER_TAB_SITE_URL_MODES)[keyof typeof BROWSER_TAB_SITE_URL_MODES]

type BrowserTabSiteMetadata = Pick<
  browser.tabs.Tab,
  "url" | "title" | "favIconUrl" | "lastAccessed"
>

export interface RecentBrowserTabSite {
  value: string
  label: string
  /** Full page URL stays available when a caller offers exact-page rules. */
  url: string
  title?: string
  favIconUrl?: string
}

/** Matches the displayed title and URL case-insensitively. */
export function matchesRecentBrowserTabSite(
  site: RecentBrowserTabSite,
  query: string,
): boolean {
  return site.label.toLowerCase().includes(query.toLowerCase())
}

/** Allows only web URLs and image data URLs supplied by the browser. */
export function sanitizeTabFaviconUrl(value?: string): string | undefined {
  if (!value) return
  const url = tryParseUrl(value)
  if (
    url?.protocol === "https:" ||
    url?.protocol === "http:" ||
    (url?.protocol === "data:" && /^data:image\//i.test(url.href))
  ) {
    return url.href
  }
}

/** Open web tabs in activity order, grouped by origin or by full page URL. */
export function getRecentBrowserTabSites(
  tabs: readonly BrowserTabSiteMetadata[],
  urlMode: BrowserTabSiteUrlMode = BROWSER_TAB_SITE_URL_MODES.ORIGIN,
): RecentBrowserTabSite[] {
  const sites = new Map<string, RecentBrowserTabSite>()
  const originFavicons = new Map<string, string>()

  for (const tab of [...tabs].sort(
    (a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
  )) {
    const page = tryParseHttpUrl(tab.url)
    if (!page) continue

    const favIconUrl = sanitizeTabFaviconUrl(tab.favIconUrl)
    if (favIconUrl && !originFavicons.has(page.origin)) {
      originFavicons.set(page.origin, favIconUrl)
    }
    const key =
      urlMode === BROWSER_TAB_SITE_URL_MODES.PAGE ? page.href : page.origin
    const existing = sites.get(key)
    if (existing) {
      if (!existing.favIconUrl && favIconUrl) existing.favIconUrl = favIconUrl
      continue
    }
    const title = tab.title?.trim()
    sites.set(key, {
      value: page.origin,
      label: title ? `${title} — ${key}` : key,
      url: page.href,
      ...(title && { title }),
      ...(favIconUrl && { favIconUrl }),
    })
  }

  // In page mode, a tab for the same page outranks any other page's icon.
  for (const site of sites.values()) {
    if (!site.favIconUrl) {
      const fallbackIcon = originFavicons.get(site.value)
      if (fallbackIcon) site.favIconUrl = fallbackIcon
    }
  }

  return [...sites.values()]
}
