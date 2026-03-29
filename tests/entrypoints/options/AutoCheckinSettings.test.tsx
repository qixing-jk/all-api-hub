import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AutoCheckinSettings from "~/features/BasicSettings/components/tabs/CheckinRedeem/AutoCheckinSettings"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  type AutoCheckinPreferences,
} from "~/types/autoCheckin"

const { toastMocks, useUserPreferencesContextMock } = vi.hoisted(() => ({
  toastMocks: {
    error: vi.fn(),
    success: vi.fn(),
  },
  useUserPreferencesContextMock: vi.fn(),
}))

const navigateWithinOptionsPageMock = vi.fn()

vi.mock("react-hot-toast", () => ({
  default: toastMocks,
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => useUserPreferencesContextMock(),
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    navigateWithinOptionsPage: (...args: unknown[]) =>
      navigateWithinOptionsPageMock(...args),
  }
})

describe("AutoCheckinSettings", () => {
  const updateAutoCheckin = vi.fn()
  const resetAutoCheckinConfig = vi.fn()

  const createPreferences = (
    overrides: Partial<AutoCheckinPreferences> = {},
  ): AutoCheckinPreferences => ({
    globalEnabled: true,
    pretriggerDailyOnUiOpen: true,
    notifyUiOnCompletion: true,
    windowStart: "08:00",
    windowEnd: "10:00",
    scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
    deterministicTime: "09:00",
    retryStrategy: {
      enabled: true,
      intervalMinutes: 30,
      maxAttemptsPerDay: 3,
    },
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    updateAutoCheckin.mockResolvedValue(true)
    resetAutoCheckinConfig.mockResolvedValue(true)
    useUserPreferencesContextMock.mockReturnValue({
      preferences: {
        autoCheckin: createPreferences(),
      },
      updateAutoCheckin,
      resetAutoCheckinConfig,
    })
  })

  it("validates time inputs before saving and reports invalid values", () => {
    render(<AutoCheckinSettings />)

    const timeInputs = screen.getAllByDisplayValue(/^\d{2}:\d{2}$/)
    fireEvent.change(timeInputs[0], { target: { value: "10:00" } })
    fireEvent.change(timeInputs[2], { target: { value: "25:00" } })
    fireEvent.change(timeInputs[2], { target: { value: "07:30" } })

    expect(toastMocks.error).toHaveBeenNthCalledWith(
      1,
      "autoCheckin:messages.error.invalidTimeWindow",
    )
    expect(toastMocks.error).toHaveBeenNthCalledWith(
      2,
      "autoCheckin:messages.error.invalidDeterministicTime",
    )
    expect(toastMocks.error).toHaveBeenNthCalledWith(
      3,
      "autoCheckin:messages.error.deterministicTimeOutsideWindow",
    )
    expect(updateAutoCheckin).not.toHaveBeenCalled()
  })

  it("saves valid schedule and retry changes and navigates to the execution view", async () => {
    render(<AutoCheckinSettings />)

    const timeInputs = screen.getAllByDisplayValue(/^\d{2}:\d{2}$/)
    const numberInputs = screen.getAllByRole("spinbutton")

    fireEvent.change(timeInputs[2], { target: { value: "09:30" } })
    fireEvent.change(numberInputs[0], { target: { value: "45" } })
    fireEvent.change(numberInputs[1], { target: { value: "4" } })
    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:settings.viewExecutionButton",
      }),
    )

    await waitFor(() => {
      expect(updateAutoCheckin).toHaveBeenCalledWith({
        deterministicTime: "09:30",
      })
    })
    expect(updateAutoCheckin).toHaveBeenCalledWith({
      retryStrategy: {
        enabled: true,
        intervalMinutes: 45,
        maxAttemptsPerDay: 3,
      },
    })
    expect(updateAutoCheckin).toHaveBeenCalledWith({
      retryStrategy: {
        enabled: true,
        intervalMinutes: 30,
        maxAttemptsPerDay: 4,
      },
    })
    expect(toastMocks.success).toHaveBeenCalled()
    expect(navigateWithinOptionsPageMock).toHaveBeenCalledWith("#autoCheckin")
  })

  it("reports invalid retry numbers and save failures", async () => {
    updateAutoCheckin.mockResolvedValue(false)

    render(<AutoCheckinSettings />)

    const numberInputs = screen.getAllByRole("spinbutton")
    fireEvent.change(numberInputs[0], { target: { value: "0" } })
    fireEvent.change(numberInputs[1], { target: { value: "-1" } })
    fireEvent.click(screen.getAllByRole("switch")[0])

    expect(toastMocks.error).toHaveBeenNthCalledWith(
      1,
      "autoCheckin:messages.error.invalidNumber",
    )
    expect(toastMocks.error).toHaveBeenNthCalledWith(
      2,
      "autoCheckin:messages.error.invalidNumber",
    )

    await waitFor(() => {
      expect(updateAutoCheckin).toHaveBeenCalledWith({ globalEnabled: false })
    })
    expect(toastMocks.error).toHaveBeenCalledWith(
      "settings:messages.saveSettingsFailed",
    )
  })
})
