import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  useOptionsSearch,
  useOptionsSearchContext,
} from "~/entrypoints/options/search/useOptionsSearch"
import type { OptionsSearchContext } from "~/entrypoints/options/search/types"
import * as browserApi from "~/utils/browser/browserApi"
import { renderHook } from "~~/tests/test-utils/render"

const context: OptionsSearchContext = {
  autoCheckinEnabled: true,
  hasOptionalPermissions: true,
  managedSiteType: "new-api",
  showTodayCashflow: true,
  sidePanelSupported: true,
}

describe("useOptionsSearch", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns all visible items when the query is empty", () => {
    const { result } = renderHook(() => useOptionsSearch(context, ""), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(result.current.results).toBe(result.current.items)
    expect(result.current.items.length).toBeGreaterThan(0)
  })

  it("prioritizes exact title matches above weaker matches", () => {
    const { result } = renderHook(() =>
      useOptionsSearch(context, "ui:navigation.bookmark"),
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(result.current.results[0]?.title).toBe("ui:navigation.bookmark")
  })

  it("matches breadcrumb-only queries", () => {
    const { result } = renderHook(() =>
      useOptionsSearch(context, "settings:tabs.permissions"),
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      result.current.results.some((item) => item.tabId === "permissions"),
    ).toBe(true)
  })
})

describe("useOptionsSearchContext", () => {
  it("adds the detected side-panel capability to the base context", () => {
    vi.spyOn(browserApi, "getSidePanelSupport").mockReturnValue({
      supported: false,
      kind: "unsupported",
      reason: "unsupported",
    })

    const { result } = renderHook(() =>
      useOptionsSearchContext({
        autoCheckinEnabled: true,
        hasOptionalPermissions: true,
        managedSiteType: "new-api",
        showTodayCashflow: false,
      }),
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(result.current).toEqual({
      autoCheckinEnabled: true,
      hasOptionalPermissions: true,
      managedSiteType: "new-api",
      showTodayCashflow: false,
      sidePanelSupported: false,
    })
  })
})
