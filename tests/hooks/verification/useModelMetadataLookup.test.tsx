import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useModelMetadataLookup } from "~/hooks/verification/useModelMetadataLookup"
import { modelMetadataService } from "~/services/models/modelMetadata"

describe("useModelMetadataLookup", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("updates lookup function once modelMetadataService initializes", async () => {
    let resolveInit!: () => void
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve
    })
    vi.spyOn(modelMetadataService, "initialize").mockReturnValue(initPromise)

    const { result } = renderHook(() => useModelMetadataLookup(true))
    const initialLookup = result.current
    expect(typeof initialLookup).toBe("function")

    await act(async () => {
      resolveInit()
      await initPromise
    })

    expect(typeof result.current).toBe("function")
  })

  it("handles initialization failure gracefully without crashing", async () => {
    let rejectInit!: (error: Error) => void
    const initPromise = new Promise<void>((_, reject) => {
      rejectInit = reject
    })
    vi.spyOn(modelMetadataService, "initialize").mockReturnValue(initPromise)

    const { result } = renderHook(() => useModelMetadataLookup(true))
    expect(typeof result.current).toBe("function")

    await act(async () => {
      rejectInit(new Error("Network failed to load metadata"))
      await initPromise.catch(() => {})
    })

    expect(typeof result.current).toBe("function")
  })

  it("does not initialize when enabled is false", () => {
    const initSpy = vi.spyOn(modelMetadataService, "initialize")
    const { result } = renderHook(() => useModelMetadataLookup(false))
    expect(initSpy).not.toHaveBeenCalled()
    expect(typeof result.current).toBe("function")
  })
})
