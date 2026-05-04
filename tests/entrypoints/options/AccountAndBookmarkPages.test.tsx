import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AccountManagement from "~/entrypoints/options/pages/AccountManagement"
import BookmarkManagement from "~/entrypoints/options/pages/BookmarkManagement"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const openAddAccountMock = vi.fn()
const handleRefreshMock = vi.fn()
const handleRefreshDisabledAccountsMock = vi.fn()
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
}))
const toastPromiseMock = vi.hoisted(() => vi.fn())
const accountDataContextState = vi.hoisted(() => ({
  current: {
    displayData: [] as any[],
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
  },
}))

vi.mock("react-hot-toast", () => ({
  default: {
    promise: toastPromiseMock,
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => mockLogger,
}))

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: openAddAccountMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  AccountDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useAccountDataContext: () => ({
    ...accountDataContextState.current,
    handleRefresh: handleRefreshMock,
    handleRefreshDisabledAccounts: handleRefreshDisabledAccountsMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleOpenExternalCheckIns: vi.fn(),
  }),
}))

vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: () => <div>AccountList</div>,
}))

vi.mock("~/features/SiteBookmarks/components/BookmarksList", () => ({
  default: () => <div>BookmarksList</div>,
}))

vi.mock("~/features/SiteBookmarks/components/BookmarkDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>BookmarkDialogOpen</div> : null,
}))

beforeEach(() => {
  openAddAccountMock.mockReset()
  handleRefreshMock.mockReset()
  handleRefreshDisabledAccountsMock.mockReset()
  mockLogger.error.mockReset()
  accountDataContextState.current = {
    displayData: [],
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
  }
  handleRefreshMock.mockResolvedValue({
    success: 0,
    failed: 0,
    latestSyncTime: 0,
    refreshedCount: 0,
  })
  handleRefreshDisabledAccountsMock.mockResolvedValue({
    processedCount: 0,
    failedCount: 0,
    reEnabledCount: 0,
    latestSyncTime: 0,
  })
  toastPromiseMock.mockImplementation(
    async (
      promise: Promise<unknown>,
      messages?: {
        success?: string | ((value: any) => string)
        error?: string | ((error: unknown) => string)
      },
    ) => {
      try {
        const result = await promise
        if (typeof messages?.success === "function") {
          messages.success(result)
        }
        return result
      } catch (error) {
        if (typeof messages?.error === "function") {
          messages.error(error)
        }
        throw error
      }
    },
  )
})

describe("options AccountManagement page", () => {
  it("renders accounts view and opens add account dialog", async () => {
    render(<AccountManagement />)

    expect(await screen.findByText("AccountList")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", { name: "account:addAccount" }),
    )
    expect(openAddAccountMock).toHaveBeenCalledTimes(1)

    expect(
      screen.queryByRole("button", { name: "bookmark:switch.bookmarks" }),
    ).not.toBeInTheDocument()
  })

  it("renders a refresh action and triggers a forced global refresh", async () => {
    render(<AccountManagement />)

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.refresh" }),
    )

    expect(handleRefreshMock).toHaveBeenCalledTimes(1)
    expect(handleRefreshMock).toHaveBeenCalledWith(true)
  })

  it("does not render the disabled-account refresh action when no disabled accounts exist", () => {
    render(<AccountManagement />)

    expect(
      screen.queryByRole("button", {
        name: "account:actions.refreshDisabledAccounts",
      }),
    ).not.toBeInTheDocument()
  })

  it("renders the disabled-account refresh action and triggers a forced probe", async () => {
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [{ id: "disabled-1", disabled: true }],
    }

    render(<AccountManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "account:actions.refreshDisabledAccounts",
      }),
    )

    expect(handleRefreshDisabledAccountsMock).toHaveBeenCalledTimes(1)
    expect(handleRefreshDisabledAccountsMock).toHaveBeenCalledWith(true)
  })

  it("disables both refresh buttons while a refresh is already running", async () => {
    accountDataContextState.current = {
      displayData: [{ id: "disabled-1", disabled: true }],
      isRefreshing: true,
      isRefreshingDisabledAccounts: false,
    }

    render(<AccountManagement />)

    const globalRefreshButton = await screen.findByRole("button", {
      name: /common:actions\.refresh/,
    })
    const disabledRefreshButton = await screen.findByRole("button", {
      name: /account:actions\.refreshDisabledAccounts/,
    })

    expect(globalRefreshButton).toBeDisabled()
    expect(disabledRefreshButton).toBeDisabled()

    fireEvent.click(disabledRefreshButton)

    expect(handleRefreshDisabledAccountsMock).not.toHaveBeenCalled()
  })

  it("uses the failure-aware disabled-account summary branch", async () => {
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [{ id: "disabled-1", disabled: true }],
    }
    handleRefreshDisabledAccountsMock.mockResolvedValueOnce({
      processedCount: 3,
      failedCount: 1,
      reEnabledCount: 1,
      latestSyncTime: 0,
    })

    render(<AccountManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "account:actions.refreshDisabledAccounts",
      }),
    )

    await waitFor(() => {
      expect(toastPromiseMock).toHaveBeenCalled()
    })

    const [, messages] = toastPromiseMock.mock.calls.at(-1)!
    expect(
      (messages as any).success?.({
        processedCount: 3,
        failedCount: 1,
        reEnabledCount: 1,
      }),
    ).toBe("account:refresh.refreshDisabledCompleteWithFailures")
  })

  it("logs an error when disabled-account refresh rejects", async () => {
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [{ id: "disabled-1", disabled: true }],
    }
    const refreshError = new Error("network")
    handleRefreshDisabledAccountsMock.mockRejectedValueOnce(refreshError)

    render(<AccountManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "account:actions.refreshDisabledAccounts",
      }),
    )

    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error during disabled account refresh",
        refreshError,
      )
    })
  })
})

describe("options BookmarkManagement page", () => {
  it("renders bookmarks view and opens bookmark dialog", async () => {
    render(<BookmarkManagement />)

    expect(await screen.findByText("BookmarksList")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.add" }),
    )
    expect(await screen.findByText("BookmarkDialogOpen")).toBeInTheDocument()
  })
})
