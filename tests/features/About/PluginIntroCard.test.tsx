import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import PluginIntroCard from "~/features/About/components/PluginIntroCard"
import toast from "~/lib/notify"
import { toggleDevUnlocked } from "~/utils/core/devMode"

vi.mock("~/utils/core/devMode", () => ({ toggleDevUnlocked: vi.fn() }))
vi.mock("~/utils/core/environment", () => ({ isDevelopmentMode: () => false }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("~/lib/notify", () => ({
  default: { success: vi.fn(), info: vi.fn() },
}))

describe("developer mode unlock gesture", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ["unlocked", "success", "devMode.activatedToast"],
    ["locked", "info", "devMode.deactivatedToast"],
    ["already_dev", "info", "devMode.alreadyDevToast"],
  ] as const)(
    "reports %s only after seven taps",
    async (outcome, method, key) => {
      vi.mocked(toggleDevUnlocked).mockReturnValue(outcome)
      render(<PluginIntroCard version="4.2.0" />)
      const version = screen.getByText("v4.2.0")
      for (let i = 0; i < 6; i++) fireEvent.click(version)
      expect(toggleDevUnlocked).not.toHaveBeenCalled()
      fireEvent.click(version)
      expect(toggleDevUnlocked).toHaveBeenCalledOnce()
      expect(toast[method]).toHaveBeenCalledWith(key)
    },
  )

  it("resets an incomplete gesture after three seconds", async () => {
    render(<PluginIntroCard version="4.2.0" />)
    const version = screen.getByText("v4.2.0")
    for (let i = 0; i < 6; i++) fireEvent.click(version)
    await vi.advanceTimersByTimeAsync(3000)
    fireEvent.click(version)
    expect(toggleDevUnlocked).not.toHaveBeenCalled()
  })
})
