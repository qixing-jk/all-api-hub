import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useVerificationPrompts } from "~/features/Verification/api/useVerificationPrompts"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"

const mockLoadOverrides = vi.fn()
const mockSaveOverrides = vi.fn()

vi.mock("~/services/verification/promptOverrides", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/verification/promptOverrides")
    >()
  return {
    ...actual,
    loadProbePromptOverrides: () => mockLoadOverrides(),
    saveProbePromptOverrides: (...args: unknown[]) =>
      mockSaveOverrides(...args),
  }
})

const TEXT_PROMPT_ID = API_VERIFICATION_PROBE_IDS.TextGeneration

describe("useVerificationPrompts", () => {
  beforeEach(() => {
    mockLoadOverrides.mockReset()
    mockSaveOverrides.mockReset()
    mockLoadOverrides.mockResolvedValue({})
    mockSaveOverrides.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("saves a prompt edited just before the dialog unmounts", async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useVerificationPrompts())
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.setPromptDraftValue(TEXT_PROMPT_ID, "Reply with PONG")
    })
    unmount()

    expect(mockSaveOverrides).toHaveBeenCalledWith({
      [TEXT_PROMPT_ID]: "Reply with PONG",
    })
  })

  it("saves a prompt once after the debounce and not again on unmount", async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useVerificationPrompts())
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.setPromptDraftValue(TEXT_PROMPT_ID, "Reply with PONG")
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(mockSaveOverrides).toHaveBeenCalledTimes(1)

    unmount()
    expect(mockSaveOverrides).toHaveBeenCalledTimes(1)
  })

  it("does not save on unmount when nothing is pending", async () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useVerificationPrompts())
    await act(async () => {
      await Promise.resolve()
    })

    unmount()

    expect(mockSaveOverrides).not.toHaveBeenCalled()
  })

  it("replaces the pending debounce when the user saves manually", async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useVerificationPrompts())
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.setPromptDraftValue(TEXT_PROMPT_ID, "Reply with PONG")
    })
    await act(async () => {
      await result.current.savePrompts()
    })
    expect(mockSaveOverrides).toHaveBeenCalledTimes(1)

    // The cancelled debounce must not fire a second write for the same edit.
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(mockSaveOverrides).toHaveBeenCalledTimes(1)
  })

  it("ignores a stored-override load that resolves after unmount", async () => {
    let resolveLoad!: (overrides: Record<string, string>) => void
    mockLoadOverrides.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve
      }),
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { unmount } = renderHook(() => useVerificationPrompts())

    unmount()
    resolveLoad({ [TEXT_PROMPT_ID]: "stale" })
    await act(async () => {
      await Promise.resolve()
    })

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
