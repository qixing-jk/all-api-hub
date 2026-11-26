import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { openAccessTokenSiteTab } from "~/services/browsingContext/accessTokenSiteTab"
import { injectContentScript } from "~/utils/browser/scripting"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/utils/browser/scripting", () => ({
  injectContentScript: vi.fn(),
}))

const expectedOrigin = "https://example.test"
const destination = `${expectedOrigin}/security#security-access`
const tab = { id: 0, url: destination, status: "complete" } as browser.tabs.Tab
const request = {
  action: "highlightAccessTokenSection",
  openedSite: expectedOrigin,
}
const missingReceiver = new Error(
  "Could not establish connection. Receiving end does not exist.",
)

function openNewApiTab(
  url = destination,
  tabOptions?: { windowId: number; cookieStoreId: string },
) {
  return openAccessTokenSiteTab(url, {
    siteType: SITE_TYPES.NEW_API,
    tab: tabOptions,
  })
}

beforeEach(() => {
  vi.spyOn(browser.tabs, "create").mockResolvedValue(tab)
  vi.spyOn(browser.tabs, "get").mockResolvedValue(tab)
  vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({ success: true })
  vi.mocked(injectContentScript).mockResolvedValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it("opens an active tab in the requested context and waits without delaying the opener", async () => {
  const ready = createDeferred<browser.tabs.Tab>()
  vi.mocked(browser.tabs.get).mockReturnValueOnce(ready.promise)
  const context = { windowId: 4, cookieStoreId: "container-a" }

  await openNewApiTab(destination, context)

  expect(browser.tabs.create).toHaveBeenCalledExactlyOnceWith({
    url: destination,
    active: true,
    ...context,
  })
  expect(browser.tabs.sendMessage).not.toHaveBeenCalled()
  ready.resolve(tab)
  await vi.waitFor(() =>
    expect(browser.tabs.sendMessage).toHaveBeenCalledExactlyOnceWith(
      tab.id,
      request,
      { frameId: 0 },
    ),
  )
})

it("reaches a late-registering receiver without reinjecting", async () => {
  vi.useFakeTimers()
  vi.mocked(browser.tabs.sendMessage)
    .mockRejectedValueOnce(missingReceiver)
    .mockRejectedValueOnce(missingReceiver)
    .mockRejectedValueOnce(missingReceiver)
  await openNewApiTab()

  await vi.waitFor(
    () => expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(4),
    { timeout: 8000 },
  )
  expect(injectContentScript).not.toHaveBeenCalled()
})

it("reinjects once and retries in the top frame when the receiver is missing", async () => {
  vi.useFakeTimers()
  vi.mocked(browser.tabs.sendMessage)
    .mockRejectedValueOnce(missingReceiver)
    .mockRejectedValueOnce(missingReceiver)
    .mockRejectedValueOnce(missingReceiver)
    .mockRejectedValueOnce(missingReceiver)
    .mockRejectedValueOnce(missingReceiver)
  vi.mocked(injectContentScript).mockResolvedValue(true)
  await openNewApiTab()

  await vi.waitFor(
    () => expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(6),
    { timeout: 8000 },
  )
  expect(injectContentScript).toHaveBeenCalledExactlyOnceWith(
    tab.id,
    expectedOrigin,
  )
  expect(browser.tabs.sendMessage).toHaveBeenLastCalledWith(tab.id, request, {
    frameId: 0,
  })
})

it.each([
  ["failed injection", missingReceiver, false, 5],
  ["permission error", new Error("No host permission"), false, 1],
  ["failed retry", missingReceiver, true, 6],
] as const)(
  "opens successfully after %s",
  async (label, error, injected, attempts) => {
    vi.useFakeTimers()
    vi.mocked(browser.tabs.sendMessage).mockRejectedValue(error)
    vi.mocked(injectContentScript).mockResolvedValue(injected)

    await expect(openNewApiTab()).resolves.toBeUndefined()

    await vi.waitFor(
      () => expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(attempts),
      { timeout: 8000 },
    )
    expect(injectContentScript).toHaveBeenCalledTimes(
      label === "permission error" ? 0 : 1,
    )
  },
)

it.each([
  [
    "closed",
    () => vi.mocked(browser.tabs.get).mockRejectedValue(new Error("No tab")),
  ],
  [
    "redirected",
    () =>
      vi
        .mocked(browser.tabs.get)
        .mockResolvedValue({ ...tab, url: "https://different.test/" }),
  ],
] as const)(
  "opens successfully when the tab has %s before it becomes ready",
  async (_label, setup) => {
    setup()

    await expect(openNewApiTab()).resolves.toBeUndefined()

    await vi.waitFor(() => expect(browser.tabs.get).toHaveBeenCalled())
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled()
    expect(injectContentScript).not.toHaveBeenCalled()
  },
)

it("waits past an initial about:blank complete snapshot before sending the highlight request", async () => {
  vi.useFakeTimers()
  vi.mocked(browser.tabs.get)
    .mockResolvedValueOnce({
      id: 0,
      url: "about:blank",
      status: "complete",
    } as browser.tabs.Tab)
    .mockResolvedValueOnce({
      id: 0,
      url: "about:blank",
      status: "complete",
    } as browser.tabs.Tab)
    .mockResolvedValueOnce({
      id: 0,
      url: destination,
      status: "loading",
    } as browser.tabs.Tab)
    .mockResolvedValueOnce(tab)

  await openNewApiTab()
  await vi.advanceTimersByTimeAsync(600)

  expect(browser.tabs.sendMessage).toHaveBeenCalledExactlyOnceWith(
    tab.id,
    request,
    { frameId: 0 },
  )
})

it("skips highlighting when the new tab has no ID", async () => {
  vi.mocked(browser.tabs.create).mockResolvedValue({ ...tab, id: undefined })

  await openNewApiTab()

  expect(browser.tabs.get).not.toHaveBeenCalled()
  expect(browser.tabs.sendMessage).not.toHaveBeenCalled()
})

it("preserves errors from opening the page itself", async () => {
  vi.mocked(browser.tabs.create).mockRejectedValue(new Error("Cannot open tab"))

  await expect(openNewApiTab()).rejects.toThrow("Cannot open tab")
  expect(browser.tabs.sendMessage).not.toHaveBeenCalled()
})

it("opens another provider's route without delivering the New API cue", async () => {
  await openAccessTokenSiteTab("https://api.apiyi.com/account/profile", {
    siteType: SITE_TYPES.APIYI,
  })
  expect(browser.tabs.create).toHaveBeenCalledOnce()
  expect(browser.tabs.get).not.toHaveBeenCalled()
  expect(browser.tabs.sendMessage).not.toHaveBeenCalled()
})

it.each([
  ["http://api.example.com", "https://api.example.com"],
  ["https://api.example.com", "https://console.example.com"],
  ["https://api.example.com", "https://example.com"],
])(
  "delivers to the normalized site from %s to %s",
  async (openedSite, landedSite) => {
    vi.mocked(browser.tabs.get).mockResolvedValue({
      ...tab,
      url: `${landedSite}/security/`,
    })
    await openNewApiTab(`${openedSite}/security#security-access`)
    await vi.waitFor(() =>
      expect(browser.tabs.sendMessage).toHaveBeenCalledExactlyOnceWith(
        tab.id,
        { ...request, openedSite },
        { frameId: 0 },
      ),
    )
  },
)

it("waits through an external OAuth hop and sends only after a same-site return", async () => {
  vi.useFakeTimers()
  vi.mocked(browser.tabs.get)
    .mockResolvedValueOnce({
      ...tab,
      url: "https://github.com/login/oauth/authorize",
    })
    .mockResolvedValueOnce({ ...tab, status: "loading" })
  await openNewApiTab()
  await vi.advanceTimersByTimeAsync(1000)
  expect(browser.tabs.sendMessage).toHaveBeenCalledExactlyOnceWith(
    tab.id,
    request,
    { frameId: 0 },
  )
  expect(injectContentScript).not.toHaveBeenCalled()
})

it("waits for the pending navigation even when the prior document is complete", async () => {
  vi.useFakeTimers()
  const pendingNavigation = { ...tab, pendingUrl: destination }
  vi.mocked(browser.tabs.get).mockResolvedValue(pendingNavigation)
  await openNewApiTab()
  await vi.advanceTimersByTimeAsync(600)
  expect(browser.tabs.sendMessage).not.toHaveBeenCalled()
  vi.mocked(browser.tabs.get).mockResolvedValue(tab)
  await vi.advanceTimersByTimeAsync(150)
  expect(browser.tabs.sendMessage).toHaveBeenCalledExactlyOnceWith(
    tab.id,
    request,
    { frameId: 0 },
  )
})

it("does not deliver a highlight across two tenants on a private public suffix", async () => {
  vi.useFakeTimers()
  vi.mocked(browser.tabs.get).mockResolvedValue({
    ...tab,
    url: "https://two.github.io/security",
  })
  await openNewApiTab("https://one.github.io/security")
  await vi.runAllTimersAsync()
  expect(browser.tabs.sendMessage).not.toHaveBeenCalled()
  expect(injectContentScript).not.toHaveBeenCalled()
})

it("passes the current allowed origin to script recovery following a redirect", async () => {
  vi.useFakeTimers()
  vi.mocked(browser.tabs.get).mockResolvedValue({
    ...tab,
    url: "https://www.example.com/security",
  })
  vi.mocked(browser.tabs.sendMessage).mockRejectedValue(missingReceiver)
  await openNewApiTab("http://api.example.com/security")
  await vi.advanceTimersByTimeAsync(8000)
  expect(injectContentScript).toHaveBeenCalledExactlyOnceWith(
    tab.id,
    "https://www.example.com",
  )
})

it("reads the tab again before injection and abandons recovery after off-site navigation", async () => {
  vi.useFakeTimers()
  vi.mocked(browser.tabs.get)
    .mockResolvedValueOnce(tab)
    .mockResolvedValue({ ...tab, url: "https://accounts.google.com/" })
  vi.mocked(browser.tabs.sendMessage).mockRejectedValue(missingReceiver)
  await openNewApiTab()
  await vi.runAllTimersAsync()
  expect(browser.tabs.sendMessage).toHaveBeenCalled()
  expect(injectContentScript).not.toHaveBeenCalled()
})
