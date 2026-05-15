import { fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import AutoCheckin from "~/entrypoints/options/pages/AutoCheckin"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { toast } = vi.hoisted(() => ({
  toast: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("react-hot-toast", () => ({
  default: toast,
}))

const { startProductAnalyticsActionMock, completeProductAnalyticsActionMock } =
  vi.hoisted(() => ({
    startProductAnalyticsActionMock: vi.fn(),
    completeProductAnalyticsActionMock: vi.fn(),
  }))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe("AutoCheckin bulk manual open", () => {
  beforeEach(() => {
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("disables the bulk manual-open button when there are no failed accounts", async () => {
    const browserApi = await import("~/utils/browser/browserApi")

    vi.spyOn(browserApi, "sendRuntimeMessage").mockResolvedValue({
      success: true,
      data: {
        perAccount: {
          "account-1": {
            accountId: "account-1",
            accountName: "Account 1",
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            timestamp: 1700000000000,
            message: "ok",
          },
        },
      },
    } as any)

    render(<AutoCheckin routeParams={{}} />)

    const button = await screen.findByRole("button", {
      name: "autoCheckin:execution.actions.openFailedManual",
    })

    expect(button).toBeDisabled()
  })

  it("opens all failed accounts even when table filters hide some results", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")
    const navigation = await import("~/utils/navigation")
    const sendRuntimeMessageSpy = vi
      .spyOn(browserApi, "sendRuntimeMessage")
      .mockImplementation(async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return {
            success: true,
            data: {
              perAccount: {
                alpha: {
                  accountId: "alpha",
                  accountName: "Alpha",
                  status: CHECKIN_RESULT_STATUS.FAILED,
                  timestamp: 1700000000000,
                  message: "alpha failed",
                },
                beta: {
                  accountId: "beta",
                  accountName: "Beta",
                  status: CHECKIN_RESULT_STATUS.FAILED,
                  timestamp: 1700000001000,
                  message: "beta failed",
                },
                gamma: {
                  accountId: "gamma",
                  accountName: "Gamma",
                  status: CHECKIN_RESULT_STATUS.SUCCESS,
                  timestamp: 1700000002000,
                  message: "ok",
                },
              },
            },
          }
        }

        if (message.action === RuntimeActionIds.AutoCheckinGetAccountInfo) {
          return {
            success: true,
            data: { id: message.accountId },
          }
        }

        return { success: true }
      })
    const openCheckInPagesSpy = vi
      .spyOn(navigation, "openCheckInPages")
      .mockResolvedValue({
        openedCount: 2,
        failedCount: 0,
      })

    render(<AutoCheckin routeParams={{}} />)

    expect(
      await screen.findByText(
        "autoCheckin:execution.hints.openFailedManualNewWindow",
      ),
    ).toBeInTheDocument()

    const searchInput = await screen.findByPlaceholderText(
      "autoCheckin:execution.filters.searchPlaceholder",
    )
    await user.type(searchInput, "Alpha")

    await user.click(
      screen.getByRole("button", {
        name: "autoCheckin:execution.actions.openFailedManual",
      }),
    )

    await waitFor(() => {
      expect(openCheckInPagesSpy).toHaveBeenCalledWith(
        [{ id: "alpha" }, { id: "beta" }],
        { openInNewWindow: false },
      )
    })

    expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinGetAccountInfo,
      accountId: "alpha",
    })
    expect(sendRuntimeMessageSpy).toHaveBeenCalledWith({
      action: RuntimeActionIds.AutoCheckinGetAccountInfo,
      accountId: "beta",
    })
    expect(toast.success).toHaveBeenCalledWith(
      "autoCheckin:messages.success.openFailedManualCompleted",
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenFailedAutoCheckinManualSignIns,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 2,
          selectedCount: 2,
          successCount: 2,
          failureCount: 0,
        },
      },
    )
  })

  it("keeps opening remaining failed accounts when one manual page fails", async () => {
    const user = userEvent.setup()
    const browserApi = await import("~/utils/browser/browserApi")
    const navigation = await import("~/utils/navigation")

    vi.spyOn(browserApi, "sendRuntimeMessage").mockImplementation(
      async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return {
            success: true,
            data: {
              perAccount: {
                alpha: {
                  accountId: "alpha",
                  accountName: "Alpha",
                  status: CHECKIN_RESULT_STATUS.FAILED,
                  timestamp: 1700000000000,
                  message: "alpha failed",
                },
                beta: {
                  accountId: "beta",
                  accountName: "Beta",
                  status: CHECKIN_RESULT_STATUS.FAILED,
                  timestamp: 1700000001000,
                  message: "beta failed",
                },
              },
            },
          }
        }

        if (message.action === RuntimeActionIds.AutoCheckinGetAccountInfo) {
          return {
            success: true,
            data: { id: message.accountId },
          }
        }

        return { success: true }
      },
    )
    vi.spyOn(navigation, "openCheckInPages").mockResolvedValue({
      openedCount: 1,
      failedCount: 1,
    })

    render(<AutoCheckin routeParams={{}} />)

    await user.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.actions.openFailedManual",
      }),
    )

    await waitFor(() => {
      expect(navigation.openCheckInPages).toHaveBeenCalledWith(
        [{ id: "alpha" }, { id: "beta" }],
        { openInNewWindow: false },
      )
    })

    expect(toast.error).toHaveBeenCalledWith(
      "autoCheckin:messages.error.openFailedManualPartial",
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: 2,
          selectedCount: 2,
          successCount: 1,
          failureCount: 1,
        },
      },
    )
  })

  it("opens failed manual sign-ins in a new window when shift-clicked", async () => {
    const browserApi = await import("~/utils/browser/browserApi")
    const navigation = await import("~/utils/navigation")

    vi.spyOn(browserApi, "sendRuntimeMessage").mockImplementation(
      async (message: any) => {
        if (message.action === RuntimeActionIds.AutoCheckinGetStatus) {
          return {
            success: true,
            data: {
              perAccount: {
                alpha: {
                  accountId: "alpha",
                  accountName: "Alpha",
                  status: CHECKIN_RESULT_STATUS.FAILED,
                  timestamp: 1700000000000,
                  message: "alpha failed",
                },
              },
            },
          }
        }

        if (message.action === RuntimeActionIds.AutoCheckinGetAccountInfo) {
          return {
            success: true,
            data: { id: message.accountId },
          }
        }

        return { success: true }
      },
    )
    const openCheckInPagesSpy = vi
      .spyOn(navigation, "openCheckInPages")
      .mockResolvedValue({
        openedCount: 1,
        failedCount: 0,
      })

    render(<AutoCheckin routeParams={{}} />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "autoCheckin:execution.actions.openFailedManual",
      }),
      { shiftKey: true },
    )

    await waitFor(() => {
      expect(openCheckInPagesSpy).toHaveBeenCalledWith([{ id: "alpha" }], {
        openInNewWindow: true,
      })
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
          selectedCount: 1,
          successCount: 1,
          failureCount: 0,
        },
      },
    )
  })
})
