import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AutoCheckin from "~/entrypoints/options/pages/AutoCheckin"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
  sendAutoCheckinMessageMock,
} = vi.hoisted(() => ({
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
  sendAutoCheckinMessageMock: vi.fn(),
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

vi.mock("~/services/checkin/autoCheckin/messaging", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/checkin/autoCheckin/messaging")
    >()

  return {
    ...actual,
    sendAutoCheckinMessage: sendAutoCheckinMessageMock,
  }
})

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
    const navigation = await import("~/utils/navigation")
    const navigateWithinOptionsPageSpy = vi
      .spyOn(navigation, "navigateWithinOptionsPage")
      .mockImplementation(vi.fn() as any)

    let statusCalls = 0
    sendAutoCheckinMessageMock.mockImplementation(async (type: string) => {
      if (type === AutoCheckinMessageTypes.GetStatus) {
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
      if (type === AutoCheckinMessageTypes.RunNow) {
        return { success: true }
      }
      return { success: true }
    })

    render(<AutoCheckin routeParams={{ runNow: "true" }} />)

    await screen.findByRole("button", { name: /execution\.runNow/i })

    expect(sendAutoCheckinMessageMock).toHaveBeenCalledWith(
      AutoCheckinMessageTypes.GetStatus,
    )
    expect(sendAutoCheckinMessageMock).toHaveBeenCalledWith(
      AutoCheckinMessageTypes.RunNow,
      {},
    )
    expect(navigateWithinOptionsPageSpy).toHaveBeenCalled()
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    await waitFor(() => {
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
  })

  it("does not auto-trigger runNow when routeParams.runNow is absent", async () => {
    sendAutoCheckinMessageMock.mockResolvedValue({
      success: true,
      data: { perAccount: {} },
    })

    render(<AutoCheckin routeParams={{}} />)

    await screen.findByRole("button", { name: /execution\.runNow/i })

    expect(sendAutoCheckinMessageMock).toHaveBeenCalledWith(
      AutoCheckinMessageTypes.GetStatus,
    )
    expect(sendAutoCheckinMessageMock).not.toHaveBeenCalledWith(
      AutoCheckinMessageTypes.RunNow,
      expect.anything(),
    )
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()
  })

  it("completes run-now analytics as skipped when the runtime surfaces no runnable work", async () => {
    const user = userEvent.setup()

    sendAutoCheckinMessageMock.mockImplementation(async (type: string) => {
      if (type === AutoCheckinMessageTypes.GetStatus) {
        return { success: true, data: { perAccount: {} } }
      }
      if (type === AutoCheckinMessageTypes.RunNow) {
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
    })

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
