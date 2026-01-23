import { describe, expect, it, vi } from "vitest"

import AutoCheckinUiOpenPretrigger from "~/components/AutoCheckinUiOpenPretrigger"
import { render, screen, waitFor } from "~/tests/test-utils/render"

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe("AutoCheckinUiOpenPretrigger", () => {
  it("shows a started toast and a completion dialog with a View details button", async () => {
    const toast = (await import("react-hot-toast")).default

    const browserApi = await import("~/utils/browserApi")
    const sendRuntimeMessageSpy = vi.spyOn(browserApi, "sendRuntimeMessage")

    sendRuntimeMessageSpy.mockImplementation(async (message: any) => {
      if (message.action === "autoCheckin:pretriggerDailyOnUiOpen") {
        void browser.runtime
          .sendMessage({
            action: "autoCheckinPretrigger:started",
            requestId: message.requestId,
          })
          .catch(() => undefined)

        return {
          success: true,
          started: true,
          lastRunResult: "partial",
          pendingRetry: true,
          summary: {
            totalEligible: 5,
            executed: 3,
            successCount: 2,
            failedCount: 1,
            skippedCount: 2,
            needsRetry: true,
          },
        }
      }

      return { success: true }
    })

    render(<AutoCheckinUiOpenPretrigger />)

    await waitFor(() => {
      expect(sendRuntimeMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "autoCheckin:pretriggerDailyOnUiOpen",
        }),
      )
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "messages.success.pretriggerStarted",
      )
    })

    expect(
      await screen.findByText("uiOpenPretrigger.dialogTitle"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "uiOpenPretrigger.viewDetails" }),
    ).toBeInTheDocument()
  })
})
