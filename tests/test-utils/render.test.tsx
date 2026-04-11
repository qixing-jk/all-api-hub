import { describe, expect, it, vi } from "vitest"

import { renderHook, waitFor } from "~~/tests/test-utils/render"

const { requestReleaseUpdateCheckNowMock, requestReleaseUpdateStatusMock } =
  vi.hoisted(() => ({
    requestReleaseUpdateCheckNowMock: vi.fn(),
    requestReleaseUpdateStatusMock: vi.fn(),
  }))

vi.mock("~/services/updates/runtime", () => ({
  requestReleaseUpdateCheckNow: requestReleaseUpdateCheckNowMock,
  requestReleaseUpdateStatus: requestReleaseUpdateStatusMock,
}))

describe("test render utilities", () => {
  it("supports renderHook with withReleaseUpdateStatusProvider false", async () => {
    const { result } = renderHook(() => "ok", {
      withReleaseUpdateStatusProvider: false,
    })

    await waitFor(() => {
      expect(result.current).toBe("ok")
    })
    expect(requestReleaseUpdateStatusMock).not.toHaveBeenCalled()
    expect(requestReleaseUpdateCheckNowMock).not.toHaveBeenCalled()
  })
})
