import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import AutoCheckin from "~/entrypoints/options/pages/AutoCheckin"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { render, screen } from "~~/tests/test-utils/render"

const {
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
} = vi.hoisted(() => ({
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
  trackProductAnalyticsActionStarted: trackProductAnalyticsActionStartedMock,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe("AutoCheckin quick run", () => {
  beforeEach(() => {
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("auto-triggers runNow when routeParams.runNow is present", async () => {
    const browserApi = await import("~/utils/browser/browserApi")
    const sendRuntimeMessageSpy = vi.spyOn(browserApi, "sendRuntimeMessage")

    const navigation = await import("~/utils/navigation")
    const navigateWithinOptionsPageSpy = vi
      .spyOn(navigation, "navigateWithinOptionsPage")
      .mockImplementation(vi.fn() as any)

    let statusCalls = 0
    sendRuntimeMessageSpy.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
        statusCalls += 1
        return {
          success: true,
          data:
            statusCalls === 1
              ? { perAccount: {} }
              : {
                  perAccount: {},
                  summary: {
                    totalEligible: 3,
                    executed: 3,
                    successCount: 2,
                    failedCount: 1,
                    skippedCount: 0,
                    needsRetry: true,
                  },
                },
        }
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
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 3,
          successCount: 2,
          failureCount: 1,
          skippedCount: 0,
        },
      },
    )
  })

  it("does not auto-trigger runNow when routeParams.runNow is absent", async () => {
    const browserApi = await import("~/utils/browser/browserApi")
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
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()
  })

  it("completes run-now analytics as skipped when the runtime surfaces no runnable work", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")

    vi.spyOn(browserApi, "sendRuntimeMessage").mockImplementation(
      async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return { success: true, data: { perAccount: {} } }
        }
        if (message.action === RuntimeActionIds.AutoCheckinRunNow) {
          return {
            success: true,
            summary: {
              totalEligible: 0,
              executed: 0,
              successCount: 0,
              failedCount: 0,
              skippedCount: 0,
              needsRetry: false,
            },
          }
        }
        return { success: true }
      },
    )

    render(<AutoCheckin routeParams={{}} />)

    await user.click(
      await screen.findByRole("button", { name: /execution\.runNow/i }),
    )

    await screen.findByRole("button", { name: /execution\.runNow/i })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      {
        insights: {
          itemCount: 0,
          successCount: 0,
          failureCount: 0,
          skippedCount: 0,
        },
      },
    )
  })
})
