// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  clearHighlightSearchParam,
  navigateFromSearchItem,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/features/OptionsSearch/navigation"
import type { OptionsSearchItem } from "~/features/OptionsSearch/types"

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
    const state = { source: "settings-search" }
    window.history.replaceState(
      state,
      "",
      "/options.html?anchor=target&highlight=target#basic",
    )
    const onNavigate = vi.fn()
    window.addEventListener("hashchange", onNavigate)

    clearHighlightSearchParam()

    expect(window.location.search).toBe("?anchor=target")
    expect(window.history.state).toEqual(state)
    expect(onNavigate).not.toHaveBeenCalled()
    window.removeEventListener("hashchange", onNavigate)
  })

  it("falls back to overview when clearing highlights from a URL without a hash", () => {
    window.history.replaceState(
      null,
      "",
      `/options.html?anchor=x&${OPTIONS_SEARCH_HIGHLIGHT_PARAM}=x`,
    )

    clearHighlightSearchParam()

    expect(window.location.hash).toBe(`#${MENU_ITEM_IDS.OVERVIEW}`)
    expect(window.location.search).toBe("?anchor=x")
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

  afterEach(() => {
    vi.useRealTimers()
  })
})
