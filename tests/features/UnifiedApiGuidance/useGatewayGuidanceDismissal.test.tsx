import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useGatewayGuidanceDismissal } from "~/features/UnifiedApiGuidance/useGatewayGuidanceDismissal"

const dismissGatewayGuidanceSurfaceMock = vi.hoisted(() => vi.fn())

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    state: {
      schemaVersion: 1,
      productTour: {},
      gatewayGuidance: { dismissedAtBySurface: {} },
    },
    dismissGatewayGuidanceSurface: dismissGatewayGuidanceSurfaceMock,
  }),
}))

describe("useGatewayGuidanceDismissal", () => {
  beforeEach(() => {
    dismissGatewayGuidanceSurfaceMock.mockReset()
    globalThis.sessionStorage?.clear()
  })

  it("keeps guidance available when session storage cannot be read", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementationOnce(() => {
        throw new Error("session storage unavailable")
      })

    const { result } = renderHook(() => useGatewayGuidanceDismissal("account"))

    expect(result.current.shouldShow).toBe(true)
    getItem.mockRestore()
  })

  it("keeps the dialog open after a failed write and clears the error after retry", async () => {
    dismissGatewayGuidanceSurfaceMock
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useGatewayGuidanceDismissal("account"))

    act(() => result.current.requestPermanentDismiss())
    await act(async () => {
      await result.current.confirmPermanentDismiss()
    })

    expect(result.current.isPermanentDismissDialogOpen).toBe(true)
    expect(result.current.hasPermanentDismissError).toBe(true)

    await act(async () => {
      await result.current.confirmPermanentDismiss()
    })

    expect(result.current.isPermanentDismissDialogOpen).toBe(false)
    expect(result.current.hasPermanentDismissError).toBe(false)
  })

  it("contains rejected writes and clears the error when cancelled", async () => {
    dismissGatewayGuidanceSurfaceMock.mockRejectedValueOnce(
      new Error("sensitive backend detail"),
    )
    const { result } = renderHook(() =>
      useGatewayGuidanceDismissal("apiCredentialProfiles"),
    )

    act(() => result.current.requestPermanentDismiss())
    await expect(
      act(async () => {
        await result.current.confirmPermanentDismiss()
      }),
    ).resolves.toBeUndefined()

    await waitFor(() => {
      expect(result.current.hasPermanentDismissError).toBe(true)
    })
    act(() => result.current.cancelPermanentDismiss())
    expect(result.current.hasPermanentDismissError).toBe(false)
    expect(result.current.isPermanentDismissDialogOpen).toBe(false)
  })
})
