import { expect, it } from "vitest"

import {
  BROWSER_TAB_SITE_URL_MODES,
  getRecentBrowserTabSites,
} from "~/utils/browser/recentTabSites"

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

it("retains the newest page and trimmed title while backfilling a safe icon from the same origin", () => {
  const sites = getRecentBrowserTabSites([
    {
      url: "https://example.com/new",
      title: "  New page  ",
      favIconUrl: "chrome://favicon",
      lastAccessed: 5,
    },
    {
      url: "https://example.com/older",
      title: "Older",
      favIconUrl: "https://example.com/icon.png",
      lastAccessed: 3,
    },
    {
      url: "https://example.com/oldest",
      favIconUrl: "http://example.com/old.png",
      lastAccessed: 1,
    },
    {
      url: "https://example.com:8443/",
      title: " ",
      favIconUrl: "data:image/png;base64,AA==",
      lastAccessed: 2,
    },
  ])

  expect(sites).toEqual([
    {
      value: "https://example.com",
      label: "New page — https://example.com",
      url: "https://example.com/new",
      title: "New page",
      favIconUrl: "https://example.com/icon.png",
    },
    {
      value: "https://example.com:8443",
      label: "https://example.com:8443",
      url: "https://example.com:8443/",
      favIconUrl: "data:image/png;base64,AA==",
    },
  ])
})

it.each([
  "edge://favicon",
  "about:blank",
  "javascript:alert(1)",
  "data:text/html,example",
  "file:///icon.png",
  "/relative.png",
])("ignores unsupported tab favicon %s", (favIconUrl) => {
  const [site] = getRecentBrowserTabSites([
    { url: "https://example.com", favIconUrl },
  ])
  expect(site).toBeDefined()
  expect(site?.favIconUrl).toBeUndefined()
})

it("prefers a matching page's icon over an icon from another page on the same origin", () => {
  const sites = getRecentBrowserTabSites(
    [
      {
        url: "https://example.com/home",
        favIconUrl: "https://example.com/home.ico",
        lastAccessed: 30,
      },
      {
        url: "https://example.com/guide?tab=1",
        title: "Guide",
        lastAccessed: 20,
      },
      {
        url: "https://example.com/console",
        title: "Console",
        lastAccessed: 10,
      },
      {
        url: "https://example.com/console",
        title: "Older Console",
        favIconUrl: "https://example.com/old.ico",
        lastAccessed: 5,
      },
    ],
    BROWSER_TAB_SITE_URL_MODES.PAGE,
  )

  expect(sites).toEqual([
    {
      value: "https://example.com",
      label: "https://example.com/home",
      url: "https://example.com/home",
      favIconUrl: "https://example.com/home.ico",
    },
    {
      value: "https://example.com",
      label: "Guide — https://example.com/guide?tab=1",
      url: "https://example.com/guide?tab=1",
      title: "Guide",
      favIconUrl: "https://example.com/home.ico",
    },
    {
      value: "https://example.com",
      label: "Console — https://example.com/console",
      url: "https://example.com/console",
      title: "Console",
      favIconUrl: "https://example.com/old.ico",
    },
  ])
})
