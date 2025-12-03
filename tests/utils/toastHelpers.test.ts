import { describe, expect, it, vi } from "vitest"

import {
  showResetToast,
  showResultToast,
  showUpdateToast,
} from "~/utils/toastHelpers"

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("i18next", () => ({
  t: vi.fn((key: string, params?: any) => {
    if (key === "settings:messages.updateSuccess")
      return `${params?.name} updated`
    if (key === "settings:messages.updateFailed")
      return `${params?.name} failed`
    if (key === "settings:danger.resetFailed") return "Reset failed"
    return key
  }),
}))

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

    it("handles empty message", async () => {
      const toast = (await import("react-hot-toast")).default
      vi.clearAllMocks()
      showResultToast(true, "")
      expect(toast.success).not.toHaveBeenCalled()
    })
  })

  describe("showUpdateToast", () => {
    it("shows success toast for update", async () => {
      const toast = (await import("react-hot-toast")).default
      showUpdateToast(true, "Setting")
      expect(toast.success).toHaveBeenCalledWith("Setting updated")
    })

    it("shows error toast for update", async () => {
      const toast = (await import("react-hot-toast")).default
      showUpdateToast(false, "Setting")
      expect(toast.error).toHaveBeenCalledWith("Setting failed")
    })
  })

  describe("showResetToast", () => {
    it("shows success toast for reset", async () => {
      const toast = (await import("react-hot-toast")).default
      showResetToast(true)
      expect(toast.success).toHaveBeenCalled()
    })

    it("shows error toast for reset", async () => {
      const toast = (await import("react-hot-toast")).default
      showResetToast(false)
      expect(toast.error).toHaveBeenCalledWith("Reset failed")
    })
  })
})
