import { afterEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import AutoCheckin from "~/entrypoints/options/pages/AutoCheckin"
import { render, screen } from "~/tests/test-utils/render"

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

describe("AutoCheckin quick run", () => {
  it("auto-triggers runNow when routeParams.runNow is present", async () => {
    const browserApi = await import("~/utils/browserApi")
    const sendRuntimeMessageSpy = vi.spyOn(browserApi, "sendRuntimeMessage")

    const navigation = await import("~/utils/navigation")
    const navigateWithinOptionsPageSpy = vi
      .spyOn(navigation, "navigateWithinOptionsPage")
      .mockImplementation(vi.fn() as any)

    sendRuntimeMessageSpy.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
        return { success: true, data: { perAccount: {} } }
      }
      if (message.action === RuntimeActionIds.AutoCheckinRunNow) {
        return { success: true }
      }
      return { success: true }
    })

    render(<AutoCheckin routeParams={{ runNow: "true" }} />)

    await screen.findByRole("button", { name: /execution\.runNow/i })

    expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinGetStatus,
    })
    expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinRunNow,
    })
    expect(navigateWithinOptionsPageSpy).toHaveBeenCalled()
  })

  it("does not auto-trigger runNow when routeParams.runNow is absent", async () => {
    const browserApi = await import("~/utils/browserApi")
    const sendRuntimeMessageSpy = vi
      .spyOn(browserApi, "sendRuntimeMessage")
      .mockResolvedValue({
        success: true,
        data: { perAccount: {} },
      })

    render(<AutoCheckin routeParams={{}} />)

    await screen.findByRole("button", { name: /execution\.runNow/i })

    expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinGetStatus,
    })
    expect(sendRuntimeMessageSpy).not.toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinRunNow,
    })
  })
})
