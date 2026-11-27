import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

import { useRecentBrowserTabSites } from "~/hooks/useRecentBrowserTabSites"
import {
  BROWSER_TAB_SITE_URL_MODES,
  type BrowserTabSiteUrlMode,
} from "~/utils/browser/recentTabSites"
import { getAllTabs } from "~/utils/browser/tabs"
import { createDeferred } from "~~/tests/test-utils/deferred"

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock("~/utils/browser/tabs", () => ({ getAllTabs: vi.fn() }))
vi.mock("~/utils/core/logger", () => ({ createLogger: () => ({ warn }) }))

beforeEach(() => {
  vi.mocked(getAllTabs).mockReset()
  warn.mockClear()
})

it("clears origin options while loading fresh page choices after a mode change", async () => {
  const tab = { url: "https://docs.example/guide", title: "Docs" }
  const tabs = [tab] as browser.tabs.Tab[]
  const pending = createDeferred<browser.tabs.Tab[]>()
  vi.mocked(getAllTabs)
    .mockResolvedValueOnce(tabs)
    .mockReturnValueOnce(pending.promise)

  const initialProps: { mode: BrowserTabSiteUrlMode } = {
    mode: BROWSER_TAB_SITE_URL_MODES.ORIGIN,
  }
  const { result, rerender } = renderHook(
    ({ mode }) => useRecentBrowserTabSites(true, mode),
    { initialProps },
  )

  await waitFor(() =>
    expect(result.current[0]?.label).toBe("Docs — https://docs.example"),
  )
  rerender({ mode: BROWSER_TAB_SITE_URL_MODES.PAGE })
  expect(result.current).toEqual([])

  await act(async () => pending.resolve(tabs))
  expect(result.current[0]?.label).toBe("Docs — https://docs.example/guide")
})

it("ignores a tab query failure after the picker is disabled", async () => {
  const pending = createDeferred<browser.tabs.Tab[]>()
  vi.mocked(getAllTabs).mockReturnValueOnce(pending.promise)

  const { result, rerender } = renderHook(
    ({ enabled }) => useRecentBrowserTabSites(enabled),
    { initialProps: { enabled: true } },
  )
  expect(getAllTabs).toHaveBeenCalledOnce()
  rerender({ enabled: false })

  await act(async () => pending.reject(new Error("Tabs unavailable")))
  expect(result.current).toEqual([])
  expect(warn).not.toHaveBeenCalled()
})
