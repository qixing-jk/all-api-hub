import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useVerificationPrompts } from "~/features/Verification/api/useVerificationPrompts"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"
import { createDeferred } from "~~/tests/test-utils/deferred"

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

/** Flush the microtasks the unmount cleanup queues behind its pending write. */
const flushAsyncWork = () => act(async () => Promise.resolve())

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

    await flushAsyncWork()
    expect(mockSaveOverrides).toHaveBeenCalledWith({
      [TEXT_PROMPT_ID]: "Reply with PONG",
    })
  })

  it("saves a reset that happens while an earlier autosave is still writing", async () => {
    vi.useFakeTimers()
    const write = createDeferred<void>()
    mockSaveOverrides.mockReturnValueOnce(write.promise)
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

    // The user clears the prompt while that write is still in flight. The reset
    // must not be lost just because the earlier draft was edited away.
    act(() => result.current.resetPrompt(TEXT_PROMPT_ID))
    unmount()

    write.resolve()
    await flushAsyncWork()
    await flushAsyncWork()

    expect(mockSaveOverrides).toHaveBeenLastCalledWith({})
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
    await flushAsyncWork()
    expect(mockSaveOverrides).toHaveBeenCalledTimes(1)
  })

  it("does not save on unmount when nothing is pending", async () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useVerificationPrompts())
    await act(async () => {
      await Promise.resolve()
    })

    unmount()
    await flushAsyncWork()

    expect(mockSaveOverrides).not.toHaveBeenCalled()
  })

  it("does not write over stored prompts it has not loaded yet", async () => {
    vi.useFakeTimers()
    mockLoadOverrides.mockReturnValue(new Promise(() => {}))
    const { unmount } = renderHook(() => useVerificationPrompts())
    await flushAsyncWork()

    unmount()
    await flushAsyncWork()

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
    await flushAsyncWork()

    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
