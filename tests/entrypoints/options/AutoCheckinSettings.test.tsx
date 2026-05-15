import { beforeEach, describe, expect, it, vi } from "vitest"

import AutoCheckinSettings from "~/features/BasicSettings/components/tabs/CheckinRedeem/AutoCheckinSettings"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SETTING_IDS,
} from "~/services/productAnalytics/events"
import {
  AUTO_CHECKIN_SCHEDULE_MODE,
  type AutoCheckinPreferences,
} from "~/types/autoCheckin"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

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

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()

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
    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

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
    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

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
    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith("#autoCheckin")
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAutoCheckinStatus,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    )
  })

  it("tracks successful preference saves with setting ids and sanitized config snapshots", async () => {
    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    fireEvent.click(screen.getAllByRole("switch")[0])
    await waitFor(() => {
      expect(updateAutoCheckin).toHaveBeenCalledWith({ globalEnabled: false })
    })
    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_EVENTS.SettingChanged,
        expect.objectContaining({
          setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinGlobalEnabled,
          enabled: false,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }),
      )
    })

    fireEvent.click(screen.getAllByRole("switch")[1])
    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_EVENTS.SettingChanged,
        expect.objectContaining({
          setting_id:
            PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinUiPretriggerEnabled,
          enabled: false,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }),
      )
    })
    fireEvent.click(screen.getAllByRole("switch")[2])
    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_EVENTS.SettingChanged,
        expect.objectContaining({
          setting_id:
            PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinNotifyCompletionEnabled,
          enabled: false,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }),
      )
    })
    fireEvent.click(
      screen.getByRole("button", {
        name: "autoCheckin:settings.scheduleModeRandom",
      }),
    )
    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_EVENTS.SettingChanged,
        expect.objectContaining({
          setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinScheduleMode,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }),
      )
    })
    fireEvent.click(screen.getAllByRole("switch")[3])

    await waitFor(() => {
      expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_EVENTS.SettingChanged,
        expect.objectContaining({
          setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinRetryEnabled,
          enabled: false,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }),
      )
    })

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
        global_enabled: false,
        ui_pretrigger_enabled: true,
        notify_completion_enabled: true,
        retry_enabled: true,
        schedule_mode: "deterministic",
        retry_interval_bucket: "10_30m",
        retry_max_attempts_bucket: "2_3",
        window_length_bucket: "1_4h",
        deterministic_time_bucket: "morning",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    )

    for (const [, payload] of trackProductAnalyticsEventMock.mock.calls) {
      expect(payload).not.toHaveProperty("windowStart")
      expect(payload).not.toHaveProperty("windowEnd")
      expect(payload).not.toHaveProperty("deterministicTime")
      expect(payload).not.toHaveProperty("intervalMinutes")
      expect(payload).not.toHaveProperty("maxAttemptsPerDay")
    }
  })

  it("tracks reset success as config reset and sanitized default snapshot", async () => {
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
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigReset,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    )
  })

  it("reports invalid retry numbers and save failures", async () => {
    updateAutoCheckin.mockResolvedValue(false)

    render(<AutoCheckinSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

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
