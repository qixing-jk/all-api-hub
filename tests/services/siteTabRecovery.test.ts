import { beforeEach, expect, it, vi } from "vitest"

import {
  assertSiteTabOrigin,
  findMatchingSiteTab,
  focusSiteTab,
  reloadSiteTabAndWait,
  resolveOrCreateSiteTab,
} from "~/services/browsingContext/siteTabRecovery"
import { waitForTabComplete } from "~/services/browsingContext/tempPage/browserAdapter"
import {
  createTab,
  focusTab,
  getActiveTab,
  getCurrentTab,
  getTab,
  onTabUpdated,
  queryTabs,
  reloadTab,
} from "~/utils/browser/tabs"

vi.mock("~/services/browsingContext/tempPage/browserAdapter", () => ({
  waitForTabComplete: vi.fn(),
}))
vi.mock("~/utils/browser/tabs", () => ({
  createTab: vi.fn(),
  focusTab: vi.fn(),
  getActiveTab: vi.fn(),
  getCurrentTab: vi.fn(),
  getTab: vi.fn(),
  onTabUpdated: vi.fn(),
  queryTabs: vi.fn(),
  reloadTab: vi.fn(),
}))

const origin = "https://example.test"
const siteUrl = `${origin}/profile`
const current = { windowId: 4, incognito: true, cookieStoreId: "container-a" }

function tab(id: number, properties: Partial<browser.tabs.Tab> = {}) {
  return {
    ...current,
    id,
    url: siteUrl,
    active: false,
    status: "complete",
    ...properties,
  } as browser.tabs.Tab
}

beforeEach(() => {
  vi.mocked(getCurrentTab).mockResolvedValue(tab(100))
  vi.mocked(queryTabs).mockResolvedValue([])
  vi.mocked(reloadTab).mockResolvedValue()
  vi.mocked(waitForTabComplete).mockResolvedValue()
})

it.each([
  [8, 8],
  [5, 7],
  [6, 7],
  [9, 7],
  [undefined, 7],
] as const)(
  "prefers an eligible site tab in the invoking context (%s)",
  async (preferred, expected) => {
    vi.mocked(queryTabs).mockResolvedValue([
      tab(5, { incognito: false }),
      tab(6, { cookieStoreId: "container-b" }),
      tab(9, { url: "https://example.test:8080/profile" }),
      tab(8, { windowId: 5, active: true }),
      tab(10),
      tab(7, { active: true }),
    ])
    const result = await findMatchingSiteTab(siteUrl, preferred)
    expect(queryTabs).toHaveBeenCalledExactlyOnceWith({ url: `${origin}/*` })
    expect(result.origin).toBe(origin)
    expect(result.current).toMatchObject(current)
    expect(result.tab?.id).toBe(expected)
  },
)

it("validates the scheme before looking at tabs", async () => {
  await expect(findMatchingSiteTab("about:blank")).rejects.toThrow()
  expect(queryTabs).not.toHaveBeenCalled()
})

it("creates the origin in the caller's container", async () => {
  vi.mocked(getCurrentTab).mockResolvedValue(undefined)
  vi.mocked(getActiveTab).mockResolvedValue(tab(100))
  vi.mocked(createTab).mockResolvedValue(tab(9))
  await expect(resolveOrCreateSiteTab(siteUrl)).resolves.toEqual({
    tabId: 9,
    existing: false,
    origin,
  })
  expect(createTab).toHaveBeenCalledExactlyOnceWith(origin, true, {
    windowId: 4,
    cookieStoreId: "container-a",
  })
})

it("rechecks origin before focusing an existing tab", async () => {
  vi.mocked(queryTabs).mockResolvedValue([tab(9)])
  vi.mocked(getTab).mockResolvedValueOnce(
    tab(9, { url: "https://other.test/" }),
  )
  await expect(focusSiteTab(siteUrl)).rejects.toThrow()
  expect(focusTab).not.toHaveBeenCalled()
  vi.mocked(getTab).mockResolvedValueOnce(tab(9))
  await focusSiteTab(siteUrl)
  expect(focusTab).toHaveBeenCalledExactlyOnceWith(tab(9))
})

it("does not load or reload anything when no matching tab exists and creation is disabled", async () => {
  await expect(
    reloadSiteTabAndWait({ siteUrl, createIfMissing: false }),
  ).resolves.toBeNull()
  expect(reloadTab).not.toHaveBeenCalled()
  expect(createTab).not.toHaveBeenCalled()
  expect(waitForTabComplete).not.toHaveBeenCalled()
})

it("waits for a newly created tab without reloading it", async () => {
  vi.mocked(createTab).mockResolvedValue(tab(9))
  vi.mocked(getTab).mockResolvedValue(tab(9))
  await expect(
    reloadSiteTabAndWait({ siteUrl, createIfMissing: true }),
  ).resolves.toBe(9)
  expect(reloadTab).not.toHaveBeenCalled()
  expect(waitForTabComplete).toHaveBeenCalledExactlyOnceWith(9, { origin })
})

it("waits for the matching tab to start reloading before probing readiness and rechecks origin", async () => {
  vi.mocked(queryTabs).mockResolvedValue([tab(9)])
  vi.mocked(getTab).mockResolvedValue(tab(9))
  const detach = vi.fn()
  vi.mocked(onTabUpdated).mockReturnValue(detach)
  const reloading = reloadSiteTabAndWait({ siteUrl })
  await vi.waitFor(() => expect(reloadTab).toHaveBeenCalledExactlyOnceWith(9))
  const update = vi.mocked(onTabUpdated).mock.lastCall![0]
  update(9, { status: "complete" }, tab(9))
  update(15, { status: "loading" }, tab(15))
  expect(waitForTabComplete).not.toHaveBeenCalled()
  update(9, { status: "loading" }, tab(9))
  await expect(reloading).resolves.toBe(9)
  expect(waitForTabComplete).toHaveBeenCalledExactlyOnceWith(9, { origin })
  expect(getTab).toHaveBeenCalledTimes(2)
  expect(detach).toHaveBeenCalledOnce()
})

it("rejects a tab that redirects away during reload", async () => {
  vi.mocked(queryTabs).mockResolvedValue([tab(9)])
  vi.mocked(getTab)
    .mockResolvedValueOnce(tab(9))
    .mockResolvedValueOnce(tab(9, { url: "https://other.test/" }))
  vi.mocked(onTabUpdated).mockImplementationOnce((update) => {
    vi.mocked(reloadTab).mockImplementationOnce(async () =>
      update(9, { status: "loading" }, tab(9)),
    )
    return vi.fn()
  })
  await expect(reloadSiteTabAndWait({ siteUrl })).rejects.toThrow()
})

it("rejects a tab whose URL becomes unavailable", async () => {
  vi.mocked(getTab).mockResolvedValue(tab(9, { url: undefined }))
  await expect(assertSiteTabOrigin(9, origin)).rejects.toThrow()
})
