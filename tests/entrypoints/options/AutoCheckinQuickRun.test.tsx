import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import AutoCheckin from "~/entrypoints/options/pages/AutoCheckin"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
  sendAutoCheckinMessageMock,
  pushWithinOptionsPageMock,
} = vi.hoisted(() => ({
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
  sendAutoCheckinMessageMock: vi.fn(),
  pushWithinOptionsPageMock: vi.fn(),
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

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: vi.fn(),
  },
}))

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    pushWithinOptionsPage: pushWithinOptionsPageMock,
  }
})

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
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)
  })

  it("shows an account setup empty state when no account can run auto check-in", async () => {
    const user = userEvent.setup()
    sendAutoCheckinMessageMock.mockImplementation(async (type: string) => {
      if (type === AutoCheckinMessageTypes.GetStatus) {
        return {
          success: true,
          data: { perAccount: {} },
        }
      }

      return { success: true }
    })

    render(<AutoCheckin routeParams={{}} />)

    expect(
      await screen.findByText("autoCheckin:execution.empty.noAccounts"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.empty.addAccount",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.ACCOUNT}`,
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinAccountSetup,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinEmptyState,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          targetKind: "options_page",
        },
      },
    )
  })

  it("shows an account setup empty state when no enabled account supports detection", async () => {
    const user = userEvent.setup()
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "manual-account",
        disabled: false,
        checkIn: { enableDetection: false },
      },
    ] as any)
    sendAutoCheckinMessageMock.mockImplementation(async (type: string) => {
      if (type === AutoCheckinMessageTypes.GetStatus) {
        return {
          success: true,
          data: { perAccount: {} },
        }
      }

      return { success: true }
    })

    render(<AutoCheckin routeParams={{}} />)

    expect(
      await screen.findByText(
        "autoCheckin:execution.empty.noDetectionAccounts",
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.empty.openAccounts",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.ACCOUNT}`,
    )
  })

  it("does not block auto check-in results when account setup lookup fails", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockRejectedValue(
      new Error("account storage unavailable"),
    )
    sendAutoCheckinMessageMock.mockImplementation(async (type: string) => {
      if (type === AutoCheckinMessageTypes.GetStatus) {
        return {
          success: true,
          data: {
            perAccount: {
              alpha: {
                accountId: "alpha",
                accountName: "Alpha",
                status: CHECKIN_RESULT_STATUS.SUCCESS,
                timestamp: 1700000000000,
                message: "ok",
              },
            },
          },
        }
      }

      return { success: true }
    })

    render(<AutoCheckin routeParams={{}} />)

    expect(await screen.findByText("Alpha")).toBeInTheDocument()
    expect(
      screen.queryByText("autoCheckin:execution.empty.noAccounts"),
    ).not.toBeInTheDocument()
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
