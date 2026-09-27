import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  useStarPromotionActive,
  useStarPromotionPromptImpression,
} from "~/features/StarPromotion/useStarPromotionActive"

const { getStateMock, trackPromptShownMock, unwatchMock, watchStateMock } =
  vi.hoisted(() => ({
    getStateMock: vi.fn(),
    trackPromptShownMock: vi.fn(),
    unwatchMock: vi.fn(),
    watchStateMock: vi.fn(),
  }))

vi.mock("~/services/productAnalytics/starPromotion", () => ({
  trackStarPromotionPromptShown: trackPromptShownMock,
}))

vi.mock("~/services/starPromotion/state", () => ({
  starPromotionState: {
    getState: getStateMock,
    watchState: watchStateMock,
  },
}))

describe("useStarPromotionActive", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    watchStateMock.mockReturnValue(unwatchMock)
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

  it("updates mounted consumers when promotion state changes", async () => {
    getStateMock.mockResolvedValue({ status: "active" })

    const { result } = renderHook(() => useStarPromotionActive())
    await waitFor(() => expect(result.current).toBe(true))

    act(() => {
      watchStateMock.mock.calls[0][0]({ status: "completed" })
    })

    expect(result.current).toBe(false)
  })

  it("clears stale activity and unsubscribes when disabled", async () => {
    getStateMock.mockResolvedValue({ status: "active" })
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useStarPromotionActive(enabled),
      { initialProps: { enabled: true } },
    )
    await waitFor(() => expect(result.current).toBe(true))

    rerender({ enabled: false })

    expect(result.current).toBe(false)
    expect(unwatchMock).toHaveBeenCalledTimes(1)
  })

  it("records one impression per visible interval without render duplicates", () => {
    const context = {
      surfaceId: "feedback_menu_star_item",
      entrypoint: "options",
    } as const
    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) =>
        useStarPromotionPromptImpression(visible, context),
      { initialProps: { visible: false } },
    )

    rerender({ visible: true })
    rerender({ visible: true })
    expect(trackPromptShownMock).toHaveBeenCalledTimes(1)
    expect(trackPromptShownMock).toHaveBeenCalledWith(context)

    rerender({ visible: false })
    rerender({ visible: true })
    expect(trackPromptShownMock).toHaveBeenCalledTimes(2)
  })
})
