import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  AccountActionsProvider,
  useAccountActionsContext,
} from "~/features/AccountManagement/hooks/AccountActionsContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

// Verifies account action flows through the public context API, including
// refresh, enable/disable, copy URL, custom check-in state, and external
// check-in feedback.
const {
  mockLoadAccountData,
  mockSendRuntimeMessage,
  mockToast,
  mockDeleteAccounts,
  mockRefreshAccount,
  mockSetAccountDisabled,
  mockSetAccountsDisabled,
  mockMarkAccountAsCustomCheckedIn,
  mockLoggerError,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
} = vi.hoisted(() => ({
  mockLoadAccountData: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    promise: vi.fn(),
  },
  mockDeleteAccounts: vi.fn(),
  mockRefreshAccount: vi.fn(),
  mockSetAccountDisabled: vi.fn(),
  mockSetAccountsDisabled: vi.fn(),
  mockMarkAccountAsCustomCheckedIn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: mockToast,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    deleteAccounts: mockDeleteAccounts,
    refreshAccount: mockRefreshAccount,
    setAccountDisabled: mockSetAccountDisabled,
    setAccountsDisabled: mockSetAccountsDisabled,
    markAccountAsCustomCheckedIn: mockMarkAccountAsCustomCheckedIn,
  },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return { ...actual, sendRuntimeMessage: mockSendRuntimeMessage }
})

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    loadAccountData: mockLoadAccountData,
  }),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: mockLoggerError,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    mockStartProductAnalyticsAction(...args),
}))

/**
 * Helper component to capture and expose the AccountActionsContext value.
 */
function ContextProbe({
  onReady,
}: {
  onReady: (ctx: ReturnType<typeof useAccountActionsContext>) => void
}) {
  const ctx = useAccountActionsContext()
  useEffect(() => {
    onReady(ctx)
  }, [ctx, onReady])
  return null
}

const createAccount = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "account-1",
    name: "Account One",
    baseUrl: "https://account.example.com",
    disabled: false,
    checkIn: { customCheckIn: { isCheckedInToday: false } },
    ...overrides,
  }) as any

const expectExternalCheckInAnalyticsStarted = () => {
  expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAllExternalCheckIns,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

const withExternalCheckInAnalytics = <T extends Record<string, unknown>>(
  options?: T,
) => ({
  ...options,
  analyticsContext: {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAllExternalCheckIns,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  },
})

const renderContext = async () => {
  let captured: ReturnType<typeof useAccountActionsContext> | undefined
  render(
    <AccountActionsProvider>
      <ContextProbe onReady={(ctx) => (captured = ctx)} />
    </AccountActionsProvider>,
  )

  await waitFor(() => {
    expect(captured).toBeDefined()
  })

  return {
    getContext: () => captured!,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockToast.promise.mockImplementation(
    async (promise: Promise<unknown>) => promise,
  )
  mockStartProductAnalyticsAction.mockReturnValue({
    complete: mockCompleteProductAnalyticsAction,
  })
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn(),
    },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("AccountActionsContext", () => {
  it("opens only unchecked external check-ins by default", async () => {
    const { getContext } = await renderContext()

    const accounts = [
      {
        id: "a1",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
      {
        id: "a2",
        checkIn: { customCheckIn: { isCheckedInToday: false } },
      },
      {
        id: "a3",
        checkIn: { customCheckIn: {} },
      },
    ] as any

    await act(async () => {
      mockSendRuntimeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          results: [],
          openedCount: 2,
          markedCount: 2,
          failedCount: 0,
          totalCount: 2,
        },
      })
      await getContext().handleOpenExternalCheckIns(
        accounts,
        withExternalCheckInAnalytics(),
      )
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ExternalCheckInOpenAndMark,
      accountIds: ["a2", "a3"],
      openInNewWindow: false,
    })
    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
    expectExternalCheckInAnalyticsStarted()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("opens all external check-ins when openAll is true", async () => {
    const { getContext } = await renderContext()

    const accounts = [
      {
        id: "b1",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
      {
        id: "b2",
        checkIn: { customCheckIn: { isCheckedInToday: false } },
      },
    ] as any

    await act(async () => {
      mockSendRuntimeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          results: [],
          openedCount: 2,
          markedCount: 2,
          failedCount: 0,
          totalCount: 2,
        },
      })
      await getContext().handleOpenExternalCheckIns(
        accounts,
        withExternalCheckInAnalytics({ openAll: true }),
      )
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ExternalCheckInOpenAndMark,
      accountIds: ["b1", "b2"],
      openInNewWindow: false,
    })
    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
    expectExternalCheckInAnalyticsStarted()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("forwards openInNewWindow to background handler", async () => {
    const { getContext } = await renderContext()

    const accounts = [
      {
        id: "w1",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
      {
        id: "w2",
        checkIn: { customCheckIn: { isCheckedInToday: false } },
      },
    ] as any

    await act(async () => {
      mockSendRuntimeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          results: [],
          openedCount: 1,
          markedCount: 1,
          failedCount: 0,
          totalCount: 1,
        },
      })
      await getContext().handleOpenExternalCheckIns(
        accounts,
        withExternalCheckInAnalytics({ openInNewWindow: true }),
      )
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ExternalCheckInOpenAndMark,
      accountIds: ["w2"],
      openInNewWindow: true,
    })
    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
    expectExternalCheckInAnalyticsStarted()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("shows a toast when no unchecked external check-ins remain", async () => {
    const { getContext } = await renderContext()

    const accounts = [
      {
        id: "c1",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
      {
        id: "c2",
        checkIn: { customCheckIn: { isCheckedInToday: true } },
      },
    ] as any

    await act(async () => {
      await getContext().handleOpenExternalCheckIns(
        accounts,
        withExternalCheckInAnalytics(),
      )
    })

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:toast.error.externalCheckInNonePending",
    )
    expectExternalCheckInAnalyticsStarted()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
    )
  })

  it("refreshes enabled accounts, exposes the in-flight id, and skips concurrent refreshes", async () => {
    const { getContext } = await renderContext()
    let resolveRefresh: ((value: { refreshed: boolean }) => void) | undefined
    const refreshResult = new Promise<{ refreshed: boolean }>((resolve) => {
      resolveRefresh = resolve
    })
    const account = createAccount({ id: "refresh-1", name: "Refresh Me" })

    mockRefreshAccount.mockReturnValueOnce(refreshResult)

    act(() => {
      void getContext().handleRefreshAccount(account, false)
    })

    await waitFor(() => {
      expect(getContext().refreshingAccountId).toBe("refresh-1")
    })

    await act(async () => {
      await getContext().handleRefreshAccount(
        createAccount({ id: "refresh-2", name: "Skipped" }),
      )
    })

    expect(mockRefreshAccount).toHaveBeenCalledTimes(1)
    expect(mockRefreshAccount).toHaveBeenCalledWith("refresh-1", false)

    const refreshToastPromise = mockToast.promise.mock.calls[0]?.[0]
    const toastConfig = mockToast.promise.mock.calls[0]?.[1]
    expect(mockToast.promise).toHaveBeenCalledTimes(1)
    expect(toastConfig.loading).toBe("messages:toast.loading.refreshingAccount")
    expect(toastConfig.error).toBe("messages:toast.error.refreshAccount")
    expect(toastConfig.success("resolved-message")).toBe("resolved-message")

    await act(async () => {
      resolveRefresh?.({ refreshed: false })
      await refreshResult
    })

    await expect(refreshToastPromise).resolves.toBe(
      "messages:toast.success.refreshSkipped",
    )
    await waitFor(() => {
      expect(getContext().refreshingAccountId).toBeNull()
    })
    expect(mockLoadAccountData).toHaveBeenCalledTimes(1)
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledTimes(1)
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
    )
  })

  it("uses the refreshed success message when account data actually changes", async () => {
    const { getContext } = await renderContext()

    mockRefreshAccount.mockResolvedValueOnce({ refreshed: true })

    await act(async () => {
      await getContext().handleRefreshAccount(
        createAccount({ id: "refresh-success", name: "Fresh Account" }),
      )
    })

    await expect(mockToast.promise.mock.calls[0][0]).resolves.toBe(
      "messages:toast.success.refreshAccount",
    )
    expect(mockLoadAccountData).toHaveBeenCalledTimes(1)
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("does not attempt to refresh disabled accounts", async () => {
    const { getContext } = await renderContext()

    await act(async () => {
      await getContext().handleRefreshAccount(
        createAccount({ id: "disabled-refresh", disabled: true }),
      )
    })

    expect(mockRefreshAccount).not.toHaveBeenCalled()
    expect(mockToast.promise).not.toHaveBeenCalled()
    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockStartProductAnalyticsAction).not.toHaveBeenCalled()
    expect(mockCompleteProductAnalyticsAction).not.toHaveBeenCalled()
  })

  it("tracks failed single refresh outcomes when storage returns false", async () => {
    const { getContext } = await renderContext()

    mockRefreshAccount.mockResolvedValueOnce(false)

    await act(async () => {
      await getContext().handleRefreshAccount(
        createAccount({ id: "refresh-false", name: "False Refresh" }),
      )
    })

    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("tracks failed single refresh outcomes when storage throws", async () => {
    const { getContext } = await renderContext()

    mockRefreshAccount.mockRejectedValueOnce(new Error("refresh exploded"))

    await act(async () => {
      await getContext().handleRefreshAccount(
        createAccount({ id: "refresh-throws", name: "Throwing Refresh" }),
      )
    })

    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("shows success feedback for both disabling and enabling accounts", async () => {
    const { getContext } = await renderContext()
    const account = createAccount({ id: "toggle-1", name: "Toggle Account" })

    mockSetAccountDisabled
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)

    let disableResult: boolean | undefined
    let enableResult: boolean | undefined
    await act(async () => {
      disableResult = await getContext().handleSetAccountDisabled(account, true)
      enableResult = await getContext().handleSetAccountDisabled(account, false)
    })

    expect(mockSetAccountDisabled).toHaveBeenNthCalledWith(1, "toggle-1", true)
    expect(mockSetAccountDisabled).toHaveBeenNthCalledWith(2, "toggle-1", false)
    expect(disableResult).toBe(true)
    expect(enableResult).toBe(true)
    expect(mockLoadAccountData).toHaveBeenCalledTimes(2)
    expect(mockToast.success).toHaveBeenNthCalledWith(
      1,
      "messages:toast.success.accountDisabled",
    )
    expect(mockToast.success).toHaveBeenNthCalledWith(
      2,
      "messages:toast.success.accountEnabled",
    )
  })

  it("shows a fallback error when account disable updates fail", async () => {
    const { getContext } = await renderContext()

    mockSetAccountDisabled.mockResolvedValueOnce(false)

    let result: boolean | undefined
    await act(async () => {
      result = await getContext().handleSetAccountDisabled(
        createAccount({ id: "toggle-fail" }),
        true,
      )
    })

    expect(result).toBe(false)
    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:toast.error.operationFailed",
    )
  })

  it("bulk-disables only accounts that still need updates and reports the updated count", async () => {
    const { getContext } = await renderContext()

    mockSetAccountsDisabled.mockResolvedValueOnce({
      updatedCount: 2,
      updatedIds: ["bulk-a", "bulk-c"],
    })

    await act(async () => {
      await getContext().handleSetAccountsDisabled(
        [
          createAccount({ id: "bulk-a", disabled: false }),
          createAccount({ id: "bulk-b", disabled: true }),
          createAccount({ id: "bulk-c", disabled: false }),
          createAccount({ id: "bulk-a", disabled: false }),
        ],
        true,
      )
    })

    expect(mockSetAccountsDisabled).toHaveBeenCalledWith(
      ["bulk-a", "bulk-c"],
      true,
    )
    expect(mockLoadAccountData).toHaveBeenCalledTimes(1)
    expect(mockToast.success).toHaveBeenCalledWith(
      "messages:toast.success.accountsDisabled",
    )
  })

  it("bulk-re-enables only accounts that still need updates and reports the updated count", async () => {
    const { getContext } = await renderContext()

    mockSetAccountsDisabled.mockResolvedValueOnce({
      updatedCount: 2,
      updatedIds: ["enable-a", "enable-c"],
    })

    await act(async () => {
      await getContext().handleSetAccountsDisabled(
        [
          createAccount({ id: "enable-a", disabled: true }),
          createAccount({ id: "enable-b", disabled: false }),
          createAccount({ id: "enable-c", disabled: true }),
          createAccount({ id: "enable-a", disabled: true }),
        ],
        false,
      )
    })

    expect(mockSetAccountsDisabled).toHaveBeenCalledWith(
      ["enable-a", "enable-c"],
      false,
    )
    expect(mockLoadAccountData).toHaveBeenCalledTimes(1)
    expect(mockToast.success).toHaveBeenCalledWith(
      "messages:toast.success.accountsEnabled",
    )
  })

  it("shows a generic failure toast when bulk disable returns no updates", async () => {
    const { getContext } = await renderContext()

    mockSetAccountsDisabled.mockResolvedValueOnce({
      updatedCount: 0,
      updatedIds: [],
    })

    await act(async () => {
      await getContext().handleSetAccountsDisabled(
        [createAccount({ id: "bulk-noop", disabled: false })],
        true,
      )
    })

    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:toast.error.operationFailedGeneric",
    )
  })

  it("bulk-deletes deduped accounts, reloads data, and reports success", async () => {
    const { getContext } = await renderContext()

    mockDeleteAccounts.mockResolvedValueOnce({
      deletedCount: 2,
      deletedIds: ["delete-a", "delete-b"],
    })

    await act(async () => {
      await expect(
        getContext().handleDeleteAccounts([
          createAccount({ id: "delete-a" }),
          createAccount({ id: "delete-b" }),
          createAccount({ id: "delete-a" }),
        ]),
      ).resolves.toEqual({
        deletedCount: 2,
        deletedIds: ["delete-a", "delete-b"],
      })
    })

    expect(mockDeleteAccounts).toHaveBeenCalledWith(["delete-a", "delete-b"])
    expect(mockLoadAccountData).toHaveBeenCalledTimes(1)
    expect(mockToast.promise).toHaveBeenCalledTimes(1)
  })

  it("skips bulk-delete side effects when no account ids are provided", async () => {
    const { getContext } = await renderContext()

    await expect(getContext().handleDeleteAccounts([])).resolves.toEqual({
      deletedCount: 0,
      deletedIds: [],
    })

    expect(mockDeleteAccounts).not.toHaveBeenCalled()
    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockToast.promise).not.toHaveBeenCalled()
  })

  it("copies account URLs to the clipboard and reports success", async () => {
    const { getContext } = await renderContext()
    const writeTextMock = vi.mocked(navigator.clipboard.writeText)

    await act(async () => {
      getContext().handleCopyUrl(
        createAccount({
          id: "copy-url",
          name: "Copy URL",
          baseUrl: "https://copied.example.com",
        }),
      )
    })

    expect(writeTextMock).toHaveBeenCalledWith("https://copied.example.com")
    expect(mockToast.success).toHaveBeenCalledWith(
      "messages:toast.success.urlCopied",
    )
  })

  it("marks custom check-ins only for enabled accounts and reloads only on successful updates", async () => {
    const { getContext } = await renderContext()

    await act(async () => {
      await getContext().handleMarkCustomCheckInAsCheckedIn(
        createAccount({ id: "checked-disabled", disabled: true }),
      )
    })

    expect(mockMarkAccountAsCustomCheckedIn).not.toHaveBeenCalled()

    mockMarkAccountAsCustomCheckedIn
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await act(async () => {
      await getContext().handleMarkCustomCheckInAsCheckedIn(
        createAccount({ id: "checked-success" }),
      )
      await getContext().handleMarkCustomCheckInAsCheckedIn(
        createAccount({ id: "checked-noop" }),
      )
    })

    expect(mockMarkAccountAsCustomCheckedIn).toHaveBeenNthCalledWith(
      1,
      "checked-success",
    )
    expect(mockMarkAccountAsCustomCheckedIn).toHaveBeenNthCalledWith(
      2,
      "checked-noop",
    )
    expect(mockLoadAccountData).toHaveBeenCalledTimes(1)
  })

  it("reports partial external check-in failures after reloading account data", async () => {
    const { getContext } = await renderContext()

    await act(async () => {
      mockSendRuntimeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          results: [],
          openedCount: 1,
          markedCount: 1,
          failedCount: 1,
          totalCount: 2,
        },
      })
      await getContext().handleOpenExternalCheckIns(
        [createAccount({ id: "open-1" }), createAccount({ id: "open-2" })],
        withExternalCheckInAnalytics(),
      )
    })

    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:errors.operation.failed",
    )
    expect(mockToast.success).not.toHaveBeenCalled()
    expectExternalCheckInAnalyticsStarted()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("falls back to runtime errors when external check-in open responses are empty", async () => {
    const { getContext } = await renderContext()

    await act(async () => {
      mockSendRuntimeMessage.mockResolvedValueOnce({
        success: false,
        error: "Background unavailable",
      })
      await getContext().handleOpenExternalCheckIns(
        [createAccount({ id: "e1" })],
        withExternalCheckInAnalytics(),
      )
    })

    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Error opening external check-ins",
      expect.any(Error),
    )
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:errors.operation.failed",
    )
    expectExternalCheckInAnalyticsStarted()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("tracks thrown external check-in errors without blocking user feedback", async () => {
    const { getContext } = await renderContext()

    await act(async () => {
      mockSendRuntimeMessage.mockRejectedValueOnce(new Error("open failed"))
      mockCompleteProductAnalyticsAction.mockRejectedValueOnce(
        new Error("analytics failed"),
      )
      await getContext().handleOpenExternalCheckIns(
        [createAccount({ id: "throw-1" })],
        withExternalCheckInAnalytics(),
      )
    })

    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Error opening external check-ins",
      expect.any(Error),
    )
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:errors.operation.failed",
    )
    expectExternalCheckInAnalyticsStarted()
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })
})
