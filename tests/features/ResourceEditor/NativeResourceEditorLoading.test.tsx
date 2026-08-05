import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  NativeResourceEditorLoadingSkeleton,
  useNativeResourceEditorLoadingVisibility,
} from "~/features/ResourceEditor/NativeResourceEditorLoading"
import { NATIVE_RESOURCE_EDITOR_LOADING_REVEALS } from "~/features/ResourceEditor/nativeResourceEditorOpeningState"
import { render, screen } from "~~/tests/test-utils/render"

describe("NativeResourceEditorLoading", () => {
  it("reveals delayed launches only after the grace period", () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() =>
        useNativeResourceEditorLoadingVisibility({
          attemptId: 1,
          reveal: NATIVE_RESOURCE_EDITOR_LOADING_REVEALS.Delayed,
        }),
      )

      expect(result.current).toBe(false)
      act(() => vi.advanceTimersByTime(149))
      expect(result.current).toBe(false)
      act(() => vi.advanceTimersByTime(1))
      expect(result.current).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("reveals retries immediately", () => {
    const { result } = renderHook(() =>
      useNativeResourceEditorLoadingVisibility({
        attemptId: 2,
        reveal: NATIVE_RESOURCE_EDITOR_LOADING_REVEALS.Immediate,
      }),
    )

    expect(result.current).toBe(true)
  })

  it("provides an accessible status while keeping placeholders decorative", () => {
    render(
      <NativeResourceEditorLoadingSkeleton
        accessibleLabel="Opening editor"
        testId="native-editor-loading"
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByTestId("native-editor-loading")).toHaveAttribute(
      "aria-busy",
      "true",
    )
    expect(screen.getByRole("status")).toHaveTextContent("Opening editor")
    expect(screen.getByRole("status").nextElementSibling).toHaveAttribute(
      "aria-hidden",
      "true",
    )
  })
})
