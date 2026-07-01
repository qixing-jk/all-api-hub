import userEvent from "@testing-library/user-event"
import { createContext, useContext, useState, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AccountManagement from "~/features/AccountManagement/AccountManagement"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render, screen } from "~~/tests/test-utils/render"

const openAddAccountMock = vi.fn()
const handleRefreshMock = vi.fn()
const handleRefreshDisabledAccountsMock = vi.fn()
const handleOpenExternalCheckInsMock = vi.fn()
const trackProductAnalyticsActionStartedMock = vi.hoisted(() => vi.fn())
const accountDataContextState = vi.hoisted(() => ({
  current: {
    displayData: [] as any[],
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
  },
}))
const DialogStateTestContext = createContext<{
  openAddAccount: () => void
} | null>(null)

function MockAccountDialog({
  isOpen,
  onOpenBookmarkImport,
}: {
  isOpen: boolean
  onOpenBookmarkImport?: () => void
}) {
  return isOpen ? (
    <div>
      <div>AccountDialogOpen</div>
      <button type="button" onClick={onOpenBookmarkImport}>
        OpenBookmarkImportFromAccountDialog
      </button>
    </div>
  ) : null
}

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => {
    const context = useContext(DialogStateTestContext)
    if (!context) {
      throw new Error("DialogStateTestContext missing")
    }
    return context
  },
}))

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({
    children,
    onOpenBookmarkImport,
  }: {
    children: ReactNode
    onOpenBookmarkImport?: () => void
  }) => {
    const [isAccountDialogOpen, setIsAccountDialogOpen] = useState(false)
    return (
      <DialogStateTestContext.Provider
        value={{
          openAddAccount: () => {
            setIsAccountDialogOpen(true)
            openAddAccountMock()
          },
        }}
      >
        {children}
        <MockAccountDialog
          isOpen={isAccountDialogOpen}
          onOpenBookmarkImport={() => {
            setIsAccountDialogOpen(false)
            onOpenBookmarkImport?.()
          }}
        />
      </DialogStateTestContext.Provider>
    )
  },
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    ...accountDataContextState.current,
    handleRefresh: handleRefreshMock,
    handleRefreshDisabledAccounts: handleRefreshDisabledAccountsMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleOpenExternalCheckIns: handleOpenExternalCheckInsMock,
  }),
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    trackProductAnalyticsActionStarted: (...args: unknown[]) =>
      trackProductAnalyticsActionStartedMock(...args),
  }
})

vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: () => <div>AccountList</div>,
}))

vi.mock("~/features/AccountManagement/components/DedupeAccountsDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>DedupeAccountsDialog</div> : null,
}))

vi.mock(
  "~/features/AccountManagement/components/BookmarkAccountImportDialog",
  () => ({
    default: function MockBookmarkAccountImportDialog({
      isOpen,
      onClose,
    }: {
      isOpen: boolean
      onClose: () => void
    }) {
      const [instanceId] = useState(() => Math.random().toString(36))

      return isOpen ? (
        <div>
          <div>BookmarkAccountImportDialogOpen</div>
          <div data-testid="bookmark-import-dialog-instance">{instanceId}</div>
          <button type="button" onClick={onClose}>
            CloseBookmarkAccountImportDialog
          </button>
        </div>
      ) : null
    },
  }),
)

beforeEach(() => {
  vi.clearAllMocks()
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
  handleOpenExternalCheckInsMock.mockResolvedValue(undefined)
})

describe("AccountManagement bookmark import entry point", () => {
  it("opens bookmark account import from the account management header", async () => {
    const user = userEvent.setup()

    render(<AccountManagement />)

    const importButton = await screen.findByTestId(
      ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton,
    )

    expect(importButton).toHaveTextContent(
      "account:actions.importFromBookmarks",
    )
    expect(importButton).toHaveAttribute(
      "title",
      "account:actions.importFromBookmarksHint",
    )

    await user.click(importButton)

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(
      await screen.findByText("BookmarkAccountImportDialogOpen"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "CloseBookmarkAccountImportDialog",
      }),
    )

    expect(
      screen.queryByText("BookmarkAccountImportDialogOpen"),
    ).not.toBeInTheDocument()
  })

  it("resets bookmark account import workflow state after closing", async () => {
    const user = userEvent.setup()

    render(<AccountManagement />)

    await user.click(
      await screen.findByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton,
      ),
    )

    const firstInstance = screen.getByTestId(
      "bookmark-import-dialog-instance",
    ).textContent

    await user.click(
      screen.getByRole("button", {
        name: "CloseBookmarkAccountImportDialog",
      }),
    )
    await user.click(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton),
    )

    expect(
      screen.getByTestId("bookmark-import-dialog-instance"),
    ).not.toHaveTextContent(firstInstance ?? "")
  })

  it("opens bookmark account import from the add-account dialog", async () => {
    const user = userEvent.setup()

    render(<AccountManagement />)

    await user.click(
      await screen.findByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton),
    )
    expect(await screen.findByText("AccountDialogOpen")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "OpenBookmarkImportFromAccountDialog",
      }),
    )

    expect(
      await screen.findByText("BookmarkAccountImportDialogOpen"),
    ).toBeInTheDocument()
    expect(screen.queryByText("AccountDialogOpen")).not.toBeInTheDocument()
  })
})
