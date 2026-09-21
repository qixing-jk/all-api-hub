import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useStarPromotionActive } from "~/features/StarPromotion/useStarPromotionActive"

const { getStateMock } = vi.hoisted(() => ({
  getStateMock: vi.fn(),
}))

vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: {
    getState: getStateMock,
  },
}))

describe("useStarPromotionActive", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reports an active promotion once the stored state resolves", async () => {
    getStateMock.mockResolvedValue({ status: "active" })

    const { result } = renderHook(() => useStarPromotionActive())

    expect(getStateMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current).toBe(true))
  })

  it("keeps the CTA hidden for a completed promotion", async () => {
    getStateMock.mockResolvedValue({ status: "completed" })

    const { result } = renderHook(() => useStarPromotionActive())

    await waitFor(() => expect(getStateMock).toHaveBeenCalledTimes(1))
    expect(result.current).toBe(false)
  })

  it("skips the storage read until the host surface is enabled", async () => {
    getStateMock.mockResolvedValue({ status: "active" })

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useStarPromotionActive(enabled),
      { initialProps: { enabled: false } },
    )

    expect(getStateMock).not.toHaveBeenCalled()
    expect(result.current).toBe(false)

    rerender({ enabled: true })

    await waitFor(() => expect(result.current).toBe(true))
    expect(getStateMock).toHaveBeenCalledTimes(1)
  })
})
