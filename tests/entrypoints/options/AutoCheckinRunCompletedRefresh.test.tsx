import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import AutoCheckin from "~/entrypoints/options/pages/AutoCheckin"
import { act, render, screen, waitFor } from "~/tests/test-utils/render"

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe("AutoCheckin status view refresh", () => {
  it("reloads status when autoCheckin:runCompleted is received", async () => {
    const browserApi = await import("~/utils/browserApi")

    const sendRuntimeMessageSpy = vi
      .spyOn(browserApi, "sendRuntimeMessage")
      .mockImplementation(async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return { success: true, data: { perAccount: {} } }
        }
        return { success: true }
      })

    let runtimeListener: ((message: any) => void) | null = null
    vi.spyOn(browserApi, "onRuntimeMessage").mockImplementation((listener) => {
      runtimeListener = listener as any
      return () => {}
    })

    render(<AutoCheckin routeParams={{}} />)

    await screen.findByRole("button", { name: /execution\.runNow/i })
    await waitFor(() => {
      expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
        action: RuntimeActionIds.AutoCheckinGetStatus,
      })
    })

    sendRuntimeMessageSpy.mockClear()
    expect(runtimeListener).toBeTypeOf("function")

    await act(async () => {
      runtimeListener!({
        action: RuntimeActionIds.AutoCheckinRunCompleted,
        runKind: "daily",
        updatedAccountIds: [],
        timestamp: Date.now(),
      })
    })

    await waitFor(() => {
      expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
        action: RuntimeActionIds.AutoCheckinGetStatus,
      })
    })
  })
})
