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

const { toast, tMock } = vi.hoisted(() => ({
  toast: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  tMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: toast,
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: (namespaces?: string | string[]) => ({
      t: (key: string, options?: Record<string, unknown>) => {
        tMock(key, options, namespaces)

        if (key.includes(":")) {
          return key
        }

        const namespace =
          typeof options?.ns === "string"
            ? options.ns
            : Array.isArray(namespaces)
              ? namespaces[0]
              : namespaces ?? "translation"

        return `${namespace}:${key}`
      },
      i18n: { language: "zh-CN", changeLanguage: vi.fn() },
    }),
  }
})

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

const mockAutoCheckinMessages = ({
  accounts = accountById,
  status = statusWithExternalCheckIns,
}: {
  accounts?: Record<string, (typeof accountById)[keyof typeof accountById]>
  status?: typeof statusWithExternalCheckIns
} = {}) => {
  vi.mocked(sendAutoCheckinMessage).mockImplementation(
    async (type: string, data?: any) => {
      if (type === AutoCheckinMessageTypes.GetStatus) {
        return {
          success: true,
          data: status,
        }
      }

      if (type === AutoCheckinMessageTypes.GetAccountInfo) {
        return {
          success: true,
          data: accounts[data?.accountId as string],
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

const mockExternalCheckInPartialFailure = () => {
  vi.mocked(sendExternalCheckInMessage).mockResolvedValue({
    success: true,
    data: {
      results: [],
      openedCount: 1,
      markedCount: 1,
      failedCount: 1,
      totalCount: 2,
    },
  })
}

const mockExternalCheckInFailure = () => {
  vi.mocked(sendExternalCheckInMessage).mockResolvedValue({
    success: false,
    error: "background unavailable",
  })
}

const createDeferredExternalCheckInResponse = () => {
  let resolve: (
    value: Awaited<ReturnType<typeof sendExternalCheckInMessage>>,
  ) => void = () => {}
  const promise = new Promise<
    Awaited<ReturnType<typeof sendExternalCheckInMessage>>
  >((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

const expectPartialFailureToast = (failedCount: number, totalCount: number) => {
  expect(toast.error).toHaveBeenCalledWith(
    "messages:toast.error.externalCheckInPartialFailed",
  )
  expect(tMock).toHaveBeenCalledWith(
    "messages:toast.error.externalCheckInPartialFailed",
    {
      count: failedCount,
      failedCount,
      totalCount,
    },
    ["autoCheckin", "messages", "account", "common"],
  )
}

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
      { ctrlKey: true },
    )

    await waitFor(() => {
      expect(sendExternalCheckInMessage).toHaveBeenCalledWith(
        ExternalCheckInMessageTypes.OpenAndMark,
        {
          accountIds: ["alpha", "beta"],
          openInNewWindow: false,
        },
      )
    })
  })

  it("opens unchecked external check-ins in a new window on shift click", async () => {
    mockAutoCheckinMessages()
    mockExternalCheckInSuccess()

    render(<AutoCheckin routeParams={{}} />)

    fireEvent.click(
      await screen.findByTitle(
        "autoCheckin:execution.hints.openExternalCheckIn",
      ),
      { shiftKey: true },
    )

    await waitFor(() => {
      expect(sendExternalCheckInMessage).toHaveBeenCalledWith(
        ExternalCheckInMessageTypes.OpenAndMark,
        {
          accountIds: ["alpha"],
          openInNewWindow: true,
        },
      )
    })
  })

  it("blocks duplicate action bar external check-in clicks while opening", async () => {
    const user = userEvent.setup()
    const deferred = createDeferredExternalCheckInResponse()
    mockAutoCheckinMessages()
    vi.mocked(sendExternalCheckInMessage).mockReturnValue(deferred.promise)

    render(<AutoCheckin routeParams={{}} />)

    const button = await screen.findByTitle(
      "autoCheckin:execution.hints.openExternalCheckIn",
    )
    await user.click(button)

    await waitFor(() => {
      expect(button).toBeDisabled()
    })
    await user.click(button)

    expect(sendExternalCheckInMessage).toHaveBeenCalledTimes(1)
    deferred.resolve({
      success: true,
      data: {
        results: [],
        openedCount: 1,
        markedCount: 1,
        failedCount: 0,
        totalCount: 1,
      },
    })
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it("shows localized partial-failure feedback from the action bar", async () => {
    const user = userEvent.setup()
    mockAutoCheckinMessages()
    mockExternalCheckInPartialFailure()

    render(<AutoCheckin routeParams={{}} />)

    await user.click(
      await screen.findByTitle(
        "autoCheckin:execution.hints.openExternalCheckIn",
      ),
    )

    await waitFor(() => {
      expectPartialFailureToast(1, 2)
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("shows skipped feedback when no action-bar external check-ins are pending", async () => {
    const user = userEvent.setup()
    mockAutoCheckinMessages({
      accounts: {
        ...accountById,
        alpha: {
          ...accountById.alpha,
          checkIn: {
            customCheckIn: {
              ...accountById.alpha.checkIn.customCheckIn,
              isCheckedInToday: true,
            },
          },
        },
      },
    })

    render(<AutoCheckin routeParams={{}} />)

    await user.click(
      await screen.findByTitle(
        "autoCheckin:execution.hints.openExternalCheckIn",
      ),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "messages:toast.error.externalCheckInNonePending",
      )
    })
    expect(sendExternalCheckInMessage).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
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
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinAccountExternalCheckIn,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinResultsTable,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("blocks duplicate row external check-in clicks while opening", async () => {
    const user = userEvent.setup()
    const deferred = createDeferredExternalCheckInResponse()
    mockAutoCheckinMessages()
    vi.mocked(sendExternalCheckInMessage).mockReturnValue(deferred.promise)

    render(<AutoCheckin routeParams={{}} />)

    const alphaRow = await screen.findByRole("row", { name: /Alpha/ })
    const button = await within(alphaRow).findByRole("button", {
      name: "autoCheckin:execution.actions.openExternal",
    })
    await user.click(button)

    await waitFor(() => {
      expect(button).toBeDisabled()
    })
    await user.click(button)

    const betaRow = await screen.findByRole("row", { name: /Beta/ })
    await user.click(
      await within(betaRow).findByRole("button", {
        name: "autoCheckin:execution.actions.openExternal",
      }),
    )

    expect(sendExternalCheckInMessage).toHaveBeenCalledTimes(1)
    deferred.resolve({
      success: true,
      data: {
        results: [],
        openedCount: 1,
        markedCount: 1,
        failedCount: 0,
        totalCount: 1,
      },
    })
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it("shows skipped feedback when the row external check-in account is disabled", async () => {
    const user = userEvent.setup()
    mockAutoCheckinMessages({
      accounts: {
        ...accountById,
        alpha: {
          ...accountById.alpha,
          disabled: true,
        },
      },
    })

    render(<AutoCheckin routeParams={{}} />)

    const alphaRow = await screen.findByRole("row", { name: /Alpha/ })
    await user.click(
      await within(alphaRow).findByRole("button", {
        name: "autoCheckin:execution.actions.openExternal",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "messages:toast.error.externalCheckInNonePending",
      )
    })
    expect(sendExternalCheckInMessage).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("shows partial-failure feedback from a results-row external check-in", async () => {
    const user = userEvent.setup()
    mockAutoCheckinMessages()
    mockExternalCheckInPartialFailure()

    render(<AutoCheckin routeParams={{}} />)

    const alphaRow = await screen.findByRole("row", { name: /Alpha/ })
    await user.click(
      await within(alphaRow).findByRole("button", {
        name: "autoCheckin:execution.actions.openExternal",
      }),
    )

    await waitFor(() => {
      expectPartialFailureToast(1, 2)
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("does not show success feedback when a results-row external check-in fails", async () => {
    const user = userEvent.setup()
    mockAutoCheckinMessages()
    mockExternalCheckInFailure()

    render(<AutoCheckin routeParams={{}} />)

    const alphaRow = await screen.findByRole("row", { name: /Alpha/ })
    await user.click(
      await within(alphaRow).findByRole("button", {
        name: "autoCheckin:execution.actions.openExternal",
      }),
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
})
