import { describe, expect, it, vi } from "vitest"

import {
  showResetToast,
  showResultToast,
  showUpdateToast,
  showWarningToast,
} from "~/utils/core/toastHelpers"

const { mockToast } = vi.hoisted(() => ({
  mockToast: vi.fn(),
}))

vi.mock("react-hot-toast", () => {
  const toastMock = Object.assign(mockToast, {
    success: vi.fn(),
    error: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
  })

  return {
    default: toastMock,
  }
})

describe("toastHelpers", () => {
  describe("showResultToast", () => {
    it("shows success toast with boolean params", async () => {
      const toast = (await import("react-hot-toast")).default
      showResultToast(true, "Success message")
      expect(toast.success).toHaveBeenCalledWith("Success message")
    })

    it("shows error toast with boolean params", async () => {
      const toast = (await import("react-hot-toast")).default
      showResultToast(false, "Success", "Error message")
      expect(toast.error).toHaveBeenCalledWith("Error message")
    })

    it("shows toast with object params", async () => {
      const toast = (await import("react-hot-toast")).default
      showResultToast({ success: true, message: "Done" })
      expect(toast.success).toHaveBeenCalledWith("Done")
    })

    it("falls back to a generic success message for empty boolean messages", async () => {
      const toast = (await import("react-hot-toast")).default
      vi.clearAllMocks()
      showResultToast(true, "")
      expect(toast.success).toHaveBeenCalledWith(
        "messages:toast.success.operationCompleted",
      )
    })

    it("prefers explicit object fallbacks before the generic fallback", async () => {
      const toast = (await import("react-hot-toast")).default
      vi.clearAllMocks()
      showResultToast({
        success: false,
        message: "",
        errorFallback: "Channel save failed",
      })
      expect(toast.error).toHaveBeenCalledWith("Channel save failed")
    })
  })

  describe("showUpdateToast", () => {
    it("shows success toast for update", async () => {
      const toast = (await import("react-hot-toast")).default
      showUpdateToast(true, "Setting")
      expect(toast.success).toHaveBeenCalledWith(
        "settings:messages.updateSuccess",
      )
    })

    it("shows error toast for update", async () => {
      const toast = (await import("react-hot-toast")).default
      showUpdateToast(false, "Setting")
      expect(toast.error).toHaveBeenCalledWith("settings:messages.updateFailed")
    })
  })

  describe("showResetToast", () => {
    it("shows success toast for reset", async () => {
      const toast = (await import("react-hot-toast")).default
      showResetToast(true)
      expect(toast.success).toHaveBeenCalledWith(
        "settings:messages.updateSuccess",
      )
    })

    it("shows error toast for reset", async () => {
      const toast = (await import("react-hot-toast")).default
      showResetToast(false)
      expect(toast.error).toHaveBeenCalledWith("settings:danger.resetFailed")
    })
  })

  describe("showWarningToast", () => {
    it("shows a generic warning toast with the shared wrapper defaults", async () => {
      const toast = (await import("react-hot-toast")).default
      showWarningToast("Review this partial-success state")
      expect(toast.custom).toHaveBeenCalledWith(expect.any(Function), {
        duration: 5000,
      })
    })

    it("falls back to the shared warning icon when toast.custom is unavailable", async () => {
      const toast = (await import("react-hot-toast")).default as any
      toast.custom = undefined
      vi.clearAllMocks()

      showWarningToast("Fallback warning")

      expect(mockToast).toHaveBeenCalledWith("Fallback warning", {
        duration: 5000,
        icon: expect.any(Object),
      })
    })
  })
})
