import { describe, expect, it, vi } from "vitest"

import { showResultToast } from "~/utils/feedback/operationFeedback"

vi.mock("~/lib/notify", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

describe("showResultToast", () => {
  it("shows an explicit success message", async () => {
    const toast = (await import("~/lib/notify")).default
    showResultToast({ success: true, message: "Success message" })
    expect(toast.success).toHaveBeenCalledWith("Success message")
  })

  it("selects the error fallback for a failed operation", async () => {
    const toast = (await import("~/lib/notify")).default
    showResultToast({
      success: false,
      successFallback: "Success",
      errorFallback: "Error message",
    })
    expect(toast.error).toHaveBeenCalledWith("Error message")
  })

  it("shows toast with object params", async () => {
    const toast = (await import("~/lib/notify")).default
    showResultToast({ success: true, message: "Done" })
    expect(toast.success).toHaveBeenCalledWith("Done")
  })

  it("falls back to a generic success message for empty messages", async () => {
    const toast = (await import("~/lib/notify")).default
    vi.clearAllMocks()
    showResultToast({ success: true, message: "" })
    expect(toast.success).toHaveBeenCalledWith(
      "messages:toast.success.operationCompleted",
    )
  })

  it("prefers explicit object fallbacks before the generic fallback", async () => {
    const toast = (await import("~/lib/notify")).default
    vi.clearAllMocks()
    showResultToast({
      success: false,
      message: "",
      errorFallback: "Channel save failed",
    })
    expect(toast.error).toHaveBeenCalledWith("Channel save failed")
  })
})
it("trims messages and uses the generic error when both supplied strings are blank", async () => {
  const notify = (await import("~/lib/notify")).default
  showResultToast({ success: false, message: "   ", errorFallback: "  " })
  expect(notify.error).toHaveBeenCalledWith(
    "messages:toast.error.operationFailedGeneric",
  )
  showResultToast({ success: true, message: "  Saved  " })
  expect(notify.success).toHaveBeenCalledWith("Saved")
})
