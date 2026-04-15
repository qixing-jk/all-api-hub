import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  AccountActionsProvider,
  useAccountActionsContext,
} from "~/features/AccountManagement/hooks/AccountActionsContext"

// Verifies account action flows through the public context API, including
// refresh, enable/disable, copy URL, custom check-in state, and external
// check-in feedback.
const {
  mockLoadAccountData,
  mockSendRuntimeMessage,
  mockToast,
  mockRefreshAccount,
  mockSetAccountDisabled,
  mockSetAccountsDisabled,
  mockMarkAccountAsCustomCheckedIn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockLoadAccountData: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockToast: {
    success: vi.fn(),
    error: vi.fn(),
    promise: vi.fn(),
  },
  mockRefreshAccount: vi.fn(),
  mockSetAccountDisabled: vi.fn(),
  mockSetAccountsDisabled: vi.fn(),
  mockMarkAccountAsCustomCheckedIn: vi.fn(),
  mockLoggerError: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: mockToast,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
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
      await getContext().handleOpenExternalCheckIns(accounts)
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ExternalCheckInOpenAndMark,
      accountIds: ["a2", "a3"],
      openInNewWindow: false,
    })
    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
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
      await getContext().handleOpenExternalCheckIns(accounts, { openAll: true })
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ExternalCheckInOpenAndMark,
      accountIds: ["b1", "b2"],
      openInNewWindow: false,
    })
    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
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
      await getContext().handleOpenExternalCheckIns(accounts, {
        openInNewWindow: true,
      })
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.ExternalCheckInOpenAndMark,
      accountIds: ["w2"],
      openInNewWindow: true,
    })
    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.success).toHaveBeenCalled()
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
      await getContext().handleOpenExternalCheckIns(accounts)
    })

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:toast.error.externalCheckInNonePending",
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
  })

  it("shows success feedback for both disabling and enabling accounts", async () => {
    const { getContext } = await renderContext()
    const account = createAccount({ id: "toggle-1", name: "Toggle Account" })

    mockSetAccountDisabled
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)

    await act(async () => {
      await getContext().handleSetAccountDisabled(account, true)
      await getContext().handleSetAccountDisabled(account, false)
    })

    expect(mockSetAccountDisabled).toHaveBeenNthCalledWith(1, "toggle-1", true)
    expect(mockSetAccountDisabled).toHaveBeenNthCalledWith(2, "toggle-1", false)
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

    await act(async () => {
      await getContext().handleSetAccountDisabled(
        createAccount({ id: "toggle-fail" }),
        true,
      )
    })

    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:toast.error.operationFailed",
    )
  })

  it("bulk-disables only accounts that still need updates and reports the updated count", async () => {
    const { getContext } = await renderContext()

    mockSetAccountsDisabled.mockResolvedValueOnce({ updatedCount: 2 })

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

  it("shows a generic failure toast when bulk disable returns no updates", async () => {
    const { getContext } = await renderContext()

    mockSetAccountsDisabled.mockResolvedValueOnce({ updatedCount: 0 })

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
      await getContext().handleOpenExternalCheckIns([
        createAccount({ id: "open-1" }),
        createAccount({ id: "open-2" }),
      ])
    })

    expect(mockLoadAccountData).toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:errors.operation.failed",
    )
    expect(mockToast.success).not.toHaveBeenCalled()
  })

  it("falls back to runtime errors when external check-in open responses are empty", async () => {
    const { getContext } = await renderContext()

    await act(async () => {
      mockSendRuntimeMessage.mockResolvedValueOnce({
        success: false,
        error: "Background unavailable",
      })
      await getContext().handleOpenExternalCheckIns([
        createAccount({ id: "e1" }),
      ])
    })

    expect(mockLoadAccountData).not.toHaveBeenCalled()
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Error opening external check-ins",
      expect.any(Error),
    )
    expect(mockToast.error).toHaveBeenCalledWith(
      "messages:errors.operation.failed",
    )
  })
})
