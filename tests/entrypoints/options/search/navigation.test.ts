// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  clearHighlightSearchParam,
  highlightSearchTarget,
  navigateFromSearchItem,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/entrypoints/options/search/navigation"
import type { OptionsSearchItem } from "~/entrypoints/options/search/types"
import { replaceWithinOptionsPage } from "~/utils/navigation"

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    replaceWithinOptionsPage: vi.fn(),
  }
})

describe("options search navigation helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    document.body.innerHTML = ""
    window.history.replaceState(
      null,
      "",
      `/options.html?${OPTIONS_SEARCH_HIGHLIGHT_PARAM}=target#basic`,
    )
  })

  it("returns early when there is no highlight param to clear", () => {
    window.history.replaceState(null, "", "/options.html#basic")

    clearHighlightSearchParam()

    expect(window.location.search).toBe("")
  })

  it("removes the highlight search param when it is present", () => {
    clearHighlightSearchParam()

    expect(replaceWithinOptionsPage).toHaveBeenCalledWith("#basic", {})
  })

  it("falls back to overview when clearing highlights from a URL without a hash", () => {
    window.history.replaceState(
      null,
      "",
      `/options.html?anchor=x&${OPTIONS_SEARCH_HIGHLIGHT_PARAM}=x`,
    )

    clearHighlightSearchParam()

    expect(replaceWithinOptionsPage).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.OVERVIEW}`,
      {
        anchor: "x",
      },
    )
  })

  it("navigates non-basic control results with anchor and highlight params", () => {
    const onPageNavigate = vi.fn()
    const item: OptionsSearchItem = {
      id: "control:import-export-webdav-url",
      kind: "control",
      pageId: MENU_ITEM_IDS.IMPORT_EXPORT,
      targetId: "webdav-url",
      title: "importExport:webdav.webdavUrl",
      titleKey: "importExport:webdav.webdavUrl",
      breadcrumbs: [],
      breadcrumbsKeys: [],
      keywords: [],
      order: 1,
    }

    navigateFromSearchItem(item, onPageNavigate)

    expect(onPageNavigate).toHaveBeenCalledWith(MENU_ITEM_IDS.IMPORT_EXPORT, {
      anchor: "webdav-url",
      highlight: "webdav-url",
    })
  })

  it("returns false when the highlight target does not exist", () => {
    expect(highlightSearchTarget("missing-target")).toBe(false)
  })

  it("removes the temporary highlight classes after the timeout elapses", () => {
    const target = document.createElement("div")
    target.id = "target"
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)

    expect(highlightSearchTarget("target")).toBe(true)
    expect(target.className).toContain("ring-2")

    vi.runAllTimers()

    expect(target.className).toBe("")
  })

  afterEach(() => {
    vi.useRealTimers()
  })
})
