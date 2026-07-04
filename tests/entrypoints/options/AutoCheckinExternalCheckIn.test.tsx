import { fireEvent, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AutoCheckin from "~/entrypoints/options/pages/AutoCheckin"
import { sendAutoCheckinMessage } from "~/services/checkin/autoCheckin/messaging"
import {
  ExternalCheckInMessageTypes,
  sendExternalCheckInMessage,
} from "~/services/checkin/externalCheckInMessaging"
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

vi.mock("~/services/checkin/autoCheckin/messaging", () => ({
  sendAutoCheckinMessage: vi.fn(),
}))

vi.mock(
  "~/services/checkin/externalCheckInMessaging",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/checkin/externalCheckInMessaging")
      >()

    return {
      ...actual,
      sendExternalCheckInMessage: vi.fn(),
    }
  },
)

const { startProductAnalyticsActionMock, completeProductAnalyticsActionMock } =
  vi.hoisted(() => ({
    startProductAnalyticsActionMock: vi.fn(),
    completeProductAnalyticsActionMock: vi.fn(),
  }))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
  trackProductAnalyticsActionCompleted: vi.fn(),
}))

const statusWithExternalCheckIns = {
  perAccount: {
    alpha: {
      accountId: "alpha",
      accountName: "Alpha",
      status: CHECKIN_RESULT_STATUS.FAILED,
      timestamp: 1700000000000,
      message: "failed",
    },
    beta: {
      accountId: "beta",
      accountName: "Beta",
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      timestamp: 1700000001000,
      message: "ok",
    },
  },
}

const accountById = {
  alpha: {
    id: "alpha",
    name: "Alpha",
    disabled: false,
    checkIn: {
      customCheckIn: {
        url: "https://external-alpha.example.invalid/checkin",
        isCheckedInToday: false,
      },
    },
  },
  beta: {
    id: "beta",
    name: "Beta",
    disabled: false,
    checkIn: {
      customCheckIn: {
        url: "https://external-beta.example.invalid/checkin",
        isCheckedInToday: true,
      },
    },
  },
}

const mockAutoCheckinMessages = () => {
  vi.mocked(sendAutoCheckinMessage).mockImplementation(
    async (type: string, data?: any) => {
      if (type === AutoCheckinMessageTypes.GetStatus) {
        return {
          success: true,
          data: statusWithExternalCheckIns,
        }
      }

      if (type === AutoCheckinMessageTypes.GetAccountInfo) {
        return {
          success: true,
          data: accountById[data?.accountId as keyof typeof accountById],
        }
      }

      return { success: true }
    },
  )
}

const mockExternalCheckInSuccess = () => {
  vi.mocked(sendExternalCheckInMessage).mockResolvedValue({
    success: true,
    data: {
      results: [],
      openedCount: 1,
      markedCount: 1,
      failedCount: 0,
      totalCount: 1,
    },
  })
}

const mockExternalCheckInFailure = () => {
  vi.mocked(sendExternalCheckInMessage).mockResolvedValue({
    success: false,
    error: "background unavailable",
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe("AutoCheckin external check-in actions", () => {
  beforeEach(() => {
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("opens unchecked external check-ins from the action bar", async () => {
    const user = userEvent.setup()
    mockAutoCheckinMessages()
    mockExternalCheckInSuccess()

    render(<AutoCheckin routeParams={{}} />)

    await user.click(
      await screen.findByTitle(
        "autoCheckin:execution.hints.openExternalCheckIn",
      ),
    )

    await waitFor(() => {
      expect(sendExternalCheckInMessage).toHaveBeenCalledWith(
        ExternalCheckInMessageTypes.OpenAndMark,
        {
          accountIds: ["alpha"],
          openInNewWindow: false,
        },
      )
    })
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAllExternalCheckIns,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("opens all external check-ins from the action bar on ctrl click", async () => {
    mockAutoCheckinMessages()
    mockExternalCheckInSuccess()

    render(<AutoCheckin routeParams={{}} />)

    fireEvent.click(
      await screen.findByTitle(
        "autoCheckin:execution.hints.openExternalCheckIn",
      ),
      { ctrlKey: true, shiftKey: true },
    )

    await waitFor(() => {
      expect(sendExternalCheckInMessage).toHaveBeenCalledWith(
        ExternalCheckInMessageTypes.OpenAndMark,
        {
          accountIds: ["alpha", "beta"],
          openInNewWindow: true,
        },
      )
    })
  })

  it("does not show success feedback when action bar external check-in fails", async () => {
    const user = userEvent.setup()
    mockAutoCheckinMessages()
    mockExternalCheckInFailure()

    render(<AutoCheckin routeParams={{}} />)

    await user.click(
      await screen.findByTitle(
        "autoCheckin:execution.hints.openExternalCheckIn",
      ),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "messages:errors.operation.failed",
      )
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.any(Object),
    )
  })

  it("opens one account external check-in from the results row", async () => {
    const user = userEvent.setup()
    mockAutoCheckinMessages()
    mockExternalCheckInSuccess()

    render(<AutoCheckin routeParams={{}} />)

    const alphaRow = await screen.findByRole("row", { name: /Alpha/ })
    await user.click(
      await within(alphaRow).findByRole("button", {
        name: "autoCheckin:execution.actions.openExternal",
      }),
    )

    await waitFor(() => {
      expect(sendExternalCheckInMessage).toHaveBeenCalledWith(
        ExternalCheckInMessageTypes.OpenAndMark,
        {
          accountIds: ["alpha"],
          openInNewWindow: false,
        },
      )
    })
  })
})
