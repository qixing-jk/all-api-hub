import { describe, expect, it } from "vitest"

import { useBookmarkDialogState } from "~/features/SiteBookmarks/hooks/useBookmarkDialogState"
import { act, renderHook } from "~~/tests/test-utils/render"

describe("useBookmarkDialogState", () => {
  it("normalizes add-prefill values before storing dialog state", () => {
    const { result } = renderHook(() => useBookmarkDialogState(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    act(() => {
      result.current.openAddBookmark({
        name: "  Sponsor Provider  ",
        url: "  https://provider.example.com/path  ",
      })
    })

    expect(result.current.state.prefill).toEqual({
      name: "Sponsor Provider",
      url: "https://provider.example.com/path",
    })
  })

  it("ignores malformed add-prefill values", () => {
    const { result } = renderHook(() => useBookmarkDialogState(), {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    act(() => {
      result.current.openAddBookmark({
        name: 42,
        url: "javascript:alert(1)",
      } as unknown)
    })

    expect(result.current.state.prefill).toBeNull()
  })
})
