import { beforeEach, describe, expect, it, vi } from "vitest"

import AutoCheckinSettings from "~/features/BasicSettings/components/tabs/CheckinRedeem/AutoCheckinSettings"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  type AutoCheckinPreferences,
} from "~/types/autoCheckin"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

const {
  toastMocks,
  trackProductAnalyticsActionStartedMock,
  trackProductAnalyticsEventMock,
  useUserPreferencesContextMock,
} = vi.hoisted(() => ({
  toastMocks: {
    error: vi.fn(),
    success: vi.fn(),
  },
  trackProductAnalyticsActionStartedMock: vi.fn(),
  trackProductAnalyticsEventMock: vi.fn(),
  useUserPreferencesContextMock: vi.fn(),
}))

const pushWithinOptionsPageMock = vi.fn()

const preferenceWriteSuccess = () => ({
  ok: true,
  preferences: {},
})

const preferenceWriteFailure = () => ({
  ok: false,
  reason: { type: "storage-error", error: new Error("save failed") },
})

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
    pushWithinOptionsPage: (...args: unknown[]) =>
      pushWithinOptionsPageMock(...args),
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: unknown[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

vi.mock("~/services/productAnalytics/dispatch", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/productAnalytics/dispatch")
    >()

  return {
    ...actual,
    trackProductAnalyticsEvent: (...args: unknown[]) =>
      trackProductAnalyticsEventMock(...args),
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
    updateAutoCheckin.mockResolvedValue(preferenceWriteSuccess())
    resetAutoCheckinConfig.mockResolvedValue(preferenceWriteSuccess())
    useUserPreferencesContextMock.mockReturnValue({
      preferences: {
        autoCheckin: createPreferences(),
      },
      updateAutoCheckin,
      resetAutoCheckinConfig,
    })
  })

  it("validates time inputs before saving and reports invalid values", () => {
    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const timeInputs = screen.getAllByDisplayValue(/^\d{2}:\d{2}$/)
    fireEvent.change(timeInputs[0], { target: { value: "10:00" } })
    expect(updateAutoCheckin).not.toHaveBeenCalled()
    expect(toastMocks.error).not.toHaveBeenCalled()
    fireEvent.blur(timeInputs[0])
    expect(timeInputs[0]).toHaveValue("08:00")

    fireEvent.change(timeInputs[2], { target: { value: "25:00" } })
    expect(toastMocks.error).toHaveBeenCalledTimes(1)
    fireEvent.blur(timeInputs[2])
    expect(timeInputs[2]).toHaveValue("09:00")

    fireEvent.change(timeInputs[2], { target: { value: "07:30" } })
    fireEvent.blur(timeInputs[2])
    expect(timeInputs[2]).toHaveValue("09:00")

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
    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const timeInputs = screen.getAllByDisplayValue(/^\d{2}:\d{2}$/)
    const numberInputs = screen.getAllByRole("spinbutton")

    fireEvent.focus(timeInputs[2])
    fireEvent.change(timeInputs[2], { target: { value: "09:30" } })
    expect(updateAutoCheckin).not.toHaveBeenCalled()
    const timeBlurSpy = vi.spyOn(timeInputs[2], "blur")
    fireEvent.keyDown(timeInputs[2], { key: "Enter" })
    expect(timeBlurSpy).toHaveBeenCalledOnce()
    fireEvent.blur(timeInputs[2])

    await waitFor(() => {
      expect(updateAutoCheckin).toHaveBeenCalledWith({
        deterministicTime: "09:30",
      })
    })

    fireEvent.change(numberInputs[0], { target: { value: "45" } })
    expect(updateAutoCheckin).not.toHaveBeenCalledWith(
      expect.objectContaining({
        retryStrategy: expect.objectContaining({ intervalMinutes: 45 }),
      }),
    )
    fireEvent.blur(numberInputs[0])

    await waitFor(() => {
      expect(updateAutoCheckin).toHaveBeenCalledWith({
        retryStrategy: {
          enabled: true,
          intervalMinutes: 45,
          maxAttemptsPerDay: 3,
        },
      })
    })

    fireEvent.focus(numberInputs[1])
    fireEvent.change(numberInputs[1], { target: { value: "4" } })
    const numberBlurSpy = vi.spyOn(numberInputs[1], "blur")
    fireEvent.keyDown(numberInputs[1], { key: "Enter" })
    expect(numberBlurSpy).toHaveBeenCalledOnce()
    fireEvent.blur(numberInputs[1])
    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:settings.viewExecutionButton",
      }),
    )

    await waitFor(() => {
      expect(updateAutoCheckin).toHaveBeenCalledWith({
        retryStrategy: {
          enabled: true,
          intervalMinutes: 30,
          maxAttemptsPerDay: 4,
        },
      })
    })
    expect(numberInputs[0]).toHaveAttribute("placeholder", "30")
    expect(numberInputs[1]).toHaveAttribute("placeholder", "3")
    expect(toastMocks.success).toHaveBeenCalled()
    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith("#autoCheckin")
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAutoCheckinStatus,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    )
  })

  it("saves changed time-window boundaries and skips unchanged values", async () => {
    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const timeInputs = screen.getAllByDisplayValue(/^\d{2}:\d{2}$/)

    fireEvent.blur(timeInputs[0])
    fireEvent.blur(timeInputs[1])
    expect(updateAutoCheckin).not.toHaveBeenCalled()

    fireEvent.change(timeInputs[0], { target: { value: "07:30" } })
    expect(updateAutoCheckin).not.toHaveBeenCalled()
    fireEvent.blur(timeInputs[0])

    await waitFor(() => {
      expect(updateAutoCheckin).toHaveBeenCalledWith({ windowStart: "07:30" })
    })

    fireEvent.change(timeInputs[1], { target: { value: "10:30" } })
    expect(updateAutoCheckin).not.toHaveBeenCalledWith({ windowEnd: "10:30" })
    fireEvent.blur(timeInputs[1])

    await waitFor(() => {
      expect(updateAutoCheckin).toHaveBeenCalledWith({ windowEnd: "10:30" })
    })
  })

  it("restores time-window drafts after invalid values or failed saves", async () => {
    updateAutoCheckin
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce(preferenceWriteFailure())

    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const timeInputs = screen.getAllByDisplayValue(/^\d{2}:\d{2}$/)

    fireEvent.change(timeInputs[1], { target: { value: "08:00" } })
    fireEvent.blur(timeInputs[1])
    await waitFor(() => {
      expect(timeInputs[1]).toHaveValue("10:00")
    })
    expect(toastMocks.error).toHaveBeenCalledWith(
      "autoCheckin:messages.error.invalidTimeWindow",
    )
    expect(updateAutoCheckin).not.toHaveBeenCalled()

    fireEvent.change(timeInputs[0], { target: { value: "07:30" } })
    fireEvent.blur(timeInputs[0])

    await waitFor(() => {
      expect(timeInputs[0]).toHaveValue("08:00")
    })
    expect(toastMocks.error).toHaveBeenCalledWith(
      "settings:messages.saveSettingsFailed",
    )

    fireEvent.change(timeInputs[1], { target: { value: "10:30" } })
    fireEvent.blur(timeInputs[1])

    await waitFor(() => {
      expect(timeInputs[1]).toHaveValue("10:00")
    })
    expect(updateAutoCheckin).toHaveBeenCalledWith({ windowEnd: "10:30" })
  })

  it("lets schedule mode options wrap inside narrow settings cards", async () => {
    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const randomButton = screen.getByRole("button", {
      name: "autoCheckin:settings.scheduleModeRandom",
    })
    const optionGroup = randomButton.parentElement

    expect(optionGroup).toHaveClass(
      "flex",
      "w-full",
      "flex-wrap",
      "[@container(min-width:42rem)]:w-auto",
    )
    expect(randomButton).toHaveClass(
      "min-w-fit",
      "flex-1",
      "[@container(min-width:42rem)]:flex-none",
    )

    await act(async () => {
      fireEvent.click(randomButton)
    })

    expect(updateAutoCheckin).toHaveBeenCalledWith({
      scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.RANDOM,
    })
  })

  it("disables schedule mode changes while preferences are saving", async () => {
    let resolveSave: (value: ReturnType<typeof preferenceWriteSuccess>) => void
    updateAutoCheckin.mockReturnValueOnce(
      new Promise<ReturnType<typeof preferenceWriteSuccess>>((resolve) => {
        resolveSave = resolve
      }),
    )

    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    fireEvent.click(screen.getAllByRole("switch")[0])

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "autoCheckin:settings.scheduleModeRandom",
        }),
      ).toBeDisabled()
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:settings.scheduleModeRandom",
      }),
    )

    expect(updateAutoCheckin).toHaveBeenCalledTimes(1)
    expect(updateAutoCheckin).toHaveBeenCalledWith({ globalEnabled: false })

    resolveSave!(preferenceWriteSuccess())

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "autoCheckin:settings.scheduleModeRandom",
        }),
      ).toBeEnabled()
    })
  })

  it("leaves settings snapshot tracking to the preferences context", async () => {
    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    fireEvent.click(screen.getAllByRole("switch")[0])
    await waitFor(() => {
      expect(updateAutoCheckin).toHaveBeenCalledWith({ globalEnabled: false })
    })

    expect(trackProductAnalyticsEventMock).not.toHaveBeenCalled()
  })

  it("does not emit component-level settings analytics on reset", async () => {
    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )
    fireEvent.click(
      screen.getAllByRole("button", { name: "common:actions.reset" })[1],
    )

    await waitFor(() => {
      expect(resetAutoCheckinConfig).toHaveBeenCalled()
    })
    expect(trackProductAnalyticsEventMock).not.toHaveBeenCalled()
  })

  it("reports invalid retry numbers and save failures", async () => {
    updateAutoCheckin.mockResolvedValue(preferenceWriteFailure())

    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const numberInputs = screen.getAllByRole("spinbutton")
    fireEvent.change(numberInputs[0], { target: { value: "0" } })
    expect(toastMocks.error).not.toHaveBeenCalled()
    fireEvent.blur(numberInputs[0])
    expect(numberInputs[0]).toHaveValue(30)

    fireEvent.change(numberInputs[1], { target: { value: "-1" } })
    fireEvent.blur(numberInputs[1])
    expect(numberInputs[1]).toHaveValue(3)
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
