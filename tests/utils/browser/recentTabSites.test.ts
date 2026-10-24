import { expect, it } from "vitest"

import { getRecentBrowserTabSites } from "~/utils/browser/recentTabSites"

it("shares recent-origin choices while retaining the most recent full page URL", () => {
  const sites = getRecentBrowserTabSites([
    { url: "https://example.com/old", title: "Old", lastAccessed: 1 },
    { url: "chrome-extension://id/options.html", lastAccessed: 100 },
    { url: "https://example.com/docs?page=2", title: "Docs", lastAccessed: 10 },
    { url: "https://other.test/", title: "Other", lastAccessed: 5 },
    { url: "about:blank", lastAccessed: 90 },
  ])
  expect(sites.map((site) => ({ value: site.value, url: site.url }))).toEqual([
    { value: "https://example.com", url: "https://example.com/docs?page=2" },
    { value: "https://other.test", url: "https://other.test/" },
  ])
})
