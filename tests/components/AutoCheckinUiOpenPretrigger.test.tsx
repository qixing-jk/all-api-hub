import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AutoCheckinPretriggerCompletionDialog } from "~/components/AutoCheckinPretriggerCompletionDialog"
import { AutoCheckinUiOpenPretrigger } from "~/components/AutoCheckinUiOpenPretrigger"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { AUTO_CHECKIN_RUN_RESULT } from "~/types/autoCheckin"
import { openAutoCheckinPage, pushWithinOptionsPage } from "~/utils/navigation"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  trackProductAnalyticsActionCompletedMock,
  trackProductAnalyticsActionStartedMock,
  trackProductAnalyticsEventMock,
} = vi.hoisted(() => ({
  trackProductAnalyticsActionCompletedMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
  trackProductAnalyticsEventMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/utils/navigation", async () => {
  const actual = await vi.importActual<any>("~/utils/navigation")
  return {
    ...actual,
    openAutoCheckinPage: vi.fn(),
    pushWithinOptionsPage: vi.fn(),
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: (...args: unknown[]) =>
    trackProductAnalyticsActionCompletedMock(...args),
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

describe("AutoCheckinUiOpenPretrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/")
  })

  it("shows a started toast and a completion dialog with a View details button", async () => {
    const toast = (await import("react-hot-toast")).default

    /**
     * The UI-open pretrigger hook reads from UserPreferencesContext and will not
     * send the runtime message until preferences finish loading and the feature
     * is enabled.
     */
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
      },
    })

    const browserApi = await import("~/utils/browser/browserApi")
    const sendRuntimeMessageSpy = vi.spyOn(browserApi, "sendRuntimeMessage")

    sendRuntimeMessageSpy.mockImplementation(async (message: any) => {
      if (
        message.action === RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen
      ) {
        void browser.runtime
          .sendMessage({
            action: RuntimeActionIds.AutoCheckinPretriggerStarted,
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
          action: RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen,
        }),
      )
    })
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "autoCheckin:messages.success.pretriggerStarted",
      )
    })
    await waitFor(() => {
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
          result: PRODUCT_ANALYTICS_RESULTS.Success,
        }),
      )
    })
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          itemCount: 5,
          successCount: 2,
          failureCount: 1,
          skippedCount: 2,
        },
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      expect.objectContaining({
        global_enabled: true,
        ui_pretrigger_enabled: true,
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
      }),
    )

    expect(
      await screen.findByText("autoCheckin:uiOpenPretrigger.dialogTitle"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "autoCheckin:uiOpenPretrigger.viewDetails",
      }),
    ).toBeInTheDocument()
  })

  it("pushes the auto-checkin page into history when view details is clicked from options", async () => {
    window.history.replaceState(null, "", "/options.html")

    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
      },
    })

    const browserApi = await import("~/utils/browser/browserApi")
    vi.spyOn(browserApi, "sendRuntimeMessage").mockImplementation(
      async (message: any) => {
        if (
          message.action === RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen
        ) {
          void browser.runtime
            .sendMessage({
              action: RuntimeActionIds.AutoCheckinPretriggerStarted,
              requestId: message.requestId,
            })
            .catch(() => undefined)

          return {
            success: true,
            started: true,
            lastRunResult: "success",
            pendingRetry: false,
            summary: {
              totalEligible: 1,
              executed: 1,
              successCount: 1,
              failedCount: 0,
              skippedCount: 0,
              needsRetry: false,
            },
          }
        }

        return { success: true }
      },
    )

    render(<AutoCheckinUiOpenPretrigger />)

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", {
        name: "autoCheckin:uiOpenPretrigger.viewDetails",
      }),
    )

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAutoCheckinStatus,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(vi.mocked(pushWithinOptionsPage)).toHaveBeenCalledWith(
      "#autoCheckin",
    )
    expect(vi.mocked(openAutoCheckinPage)).not.toHaveBeenCalled()
  })

  it("tracks failed pretrigger attempts without raw error details", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
      },
    })

    const browserApi = await import("~/utils/browser/browserApi")
    vi.spyOn(browserApi, "sendRuntimeMessage").mockResolvedValue({
      success: false,
      started: false,
      error: "raw backend reason",
    })

    render(<AutoCheckinUiOpenPretrigger />)

    await waitFor(() => {
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          result: PRODUCT_ANALYTICS_RESULTS.Skipped,
        }),
      )
    })
    for (const call of trackProductAnalyticsActionCompletedMock.mock.calls) {
      expect(call[0]).not.toHaveProperty("error")
      expect(call[0]).not.toHaveProperty("reason")
    }
  })

  it("maps failed run results to failed analytics", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin!,
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
      },
    })

    const browserApi = await import("~/utils/browser/browserApi")
    vi.spyOn(browserApi, "sendRuntimeMessage").mockResolvedValue({
      success: true,
      started: true,
      lastRunResult: AUTO_CHECKIN_RUN_RESULT.FAILED,
      pendingRetry: false,
      summary: {
        totalEligible: 1,
        executed: 1,
        successCount: 0,
        failedCount: 1,
        skippedCount: 0,
        needsRetry: false,
      },
    })

    render(<AutoCheckinUiOpenPretrigger />)

    await waitFor(() => {
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
        }),
      )
    })
  })

  it("tracks completion dialog close clicks", async () => {
    render(
      <AutoCheckinPretriggerCompletionDialog
        isOpen
        summary={null}
        pendingRetry={false}
        onClose={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", {
        name: "autoCheckin:uiOpenPretrigger.close",
      }),
    )

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CloseRedemptionBatchResult,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })
})
