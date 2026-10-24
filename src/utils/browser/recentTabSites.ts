export interface RecentBrowserTabSite {
  value: string
  label: string
  /** Full page URL stays available when a caller offers exact-page rules. */
  url: string
}

/** Unique web origins in activity order, retaining the newest page per site. */
export function getRecentBrowserTabSites(
  tabs: Array<{ url?: string; title?: string; lastAccessed?: number }>,
): RecentBrowserTabSite[] {
  const sites = new Map<string, RecentBrowserTabSite>()
  for (const tab of [...tabs].sort(
    (a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
  )) {
    if (!tab.url) continue
    try {
      const parsed = new URL(tab.url)
      if (!/^https?:$/.test(parsed.protocol) || sites.has(parsed.origin))
        continue
      const title = tab.title?.trim()
      sites.set(parsed.origin, {
        value: parsed.origin,
        label: title ? `${title} — ${parsed.origin}` : parsed.origin,
        url: parsed.href,
      })
    } catch {
      /* A navigating tab may not have a complete URL yet. */
    }
  }
  return [...sites.values()]
}
