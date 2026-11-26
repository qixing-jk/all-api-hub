export interface RecentBrowserTabSite {
  value: string
  label: string
  /** Full page URL stays available when a caller offers exact-page rules. */
  url: string
  title?: string
}

/** Open web tabs in activity order, grouped by origin or by full page URL. */
export function getRecentBrowserTabSites(
  tabs: Array<{ url?: string; title?: string; lastAccessed?: number }>,
  urlMode: "origin" | "page" = "origin",
): RecentBrowserTabSite[] {
  const sites = new Map<string, RecentBrowserTabSite>()
  for (const tab of [...tabs].sort(
    (a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
  )) {
    if (!tab.url) continue
    try {
      const parsed = new URL(tab.url)
      if (!/^https?:$/.test(parsed.protocol)) continue
      const key = urlMode === "page" ? parsed.href : parsed.origin
      if (sites.has(key)) continue
      const title = tab.title?.trim()
      sites.set(key, {
        value: parsed.origin,
        label: title ? `${title} — ${key}` : key,
        url: parsed.href,
        ...(title && { title }),
      })
    } catch {
      /* A navigating tab may not have a complete URL yet. */
    }
  }
  return [...sites.values()]
}
