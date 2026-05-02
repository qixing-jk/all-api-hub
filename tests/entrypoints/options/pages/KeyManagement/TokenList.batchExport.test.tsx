import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TokenList } from "~/features/KeyManagement/components/TokenList"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { render, screen, waitFor } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

const { mockBuildBatchExportResult } = vi.hoisted(() => ({
  mockBuildBatchExportResult: vi.fn(),
}))

vi.mock("~/features/KeyManagement/components/TokenListItem", () => ({
  TokenListItem: ({
    token,
    isSelected,
    onSelectionChange,
    onOpenCCSwitchDialog,
  }: {
    token: { name: string }
    isSelected?: boolean
    onSelectionChange?: (checked: boolean) => void
    onOpenCCSwitchDialog?: () => void
  }) => (
    <div>
      <label>
        <input
          type="checkbox"
          checked={isSelected === true}
          onChange={(event) => onSelectionChange?.(event.currentTarget.checked)}
        />
        {token.name}
      </label>
      <button type="button" onClick={onOpenCCSwitchDialog}>
        Open CC Switch for {token.name}
      </button>
    </div>
  ),
}))

vi.mock("~/components/CCSwitchExportDialog", () => ({
  CCSwitchExportDialog: ({
    isOpen,
    account,
    onClose,
  }: {
    isOpen: boolean
    account: { name: string }
    onClose: () => void
  }) =>
    isOpen ? (
      <div data-testid="cc-switch-export-dialog">
        <span>CC Switch export for {account.name}</span>
        <button type="button" onClick={onClose}>
          Close CC Switch export
        </button>
      </div>
    ) : null,
}))

vi.mock(
  "~/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog",
  () => ({
    ManagedSiteTokenBatchExportDialog: ({
      isOpen,
      items,
      onClose,
      onCompleted,
    }: {
      isOpen: boolean
      items: Array<{ token: { accountId: string; id: number } }>
      onClose: () => void
      onCompleted?: (result: {
        totalSelected: number
        attemptedCount: number
        createdCount: number
        failedCount: number
        skippedCount: number
        items: Array<{
          id: string
          accountName: string
          tokenName: string
          success: boolean
          skipped: boolean
        }>
      }) => void
    }) =>
      isOpen ? (
        <div data-testid="batch-export-dialog">
          <div data-testid="batch-export-item-count">{items.length}</div>
          <button
            type="button"
            onClick={() => onCompleted?.(mockBuildBatchExportResult(items))}
          >
            Complete batch export
          </button>
          <button type="button" onClick={onClose}>
            Close batch export
          </button>
        </div>
      ) : null,
  }),
)

const account = createAccount({ id: "acc-1", name: "Account 1" })
const token1 = createToken({
  id: 1,
  name: "Token 1",
  accountId: account.id,
  accountName: account.name,
})
const token2 = createToken({
  id: 2,
  name: "Token 2",
  accountId: account.id,
  accountName: account.name,
})
const accountB = createAccount({ id: "acc-2", name: "Account 2" })
const tokenB = createToken({
  id: 1,
  name: "Token B",
  accountId: accountB.id,
  accountName: accountB.name,
})

const defaultProps = {
  isLoading: false,
  visibleKeys: new Set<string>(),
  resolvingVisibleKeys: new Set<string>(),
  getVisibleTokenKey: (token: { key: string }) => token.key,
  toggleKeyVisibility: vi.fn(),
  copyKey: vi.fn(),
  handleEditToken: vi.fn(),
  handleDeleteToken: vi.fn(),
  handleAddToken: vi.fn(),
  selectedAccount: account.id,
  displayData: [account] as any,
}

const renderTokenList = (props?: Partial<Parameters<typeof TokenList>[0]>) =>
  render(
    <TokenList
      {...(defaultProps as any)}
      tokens={[token1, token2] as any}
      filteredTokens={[token1, token2] as any}
      {...props}
    />,
  )

describe("TokenList batch export selection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildBatchExportResult.mockImplementation((items) => ({
      totalSelected: items.length,
      attemptedCount: items.length,
      createdCount: items.length,
      failedCount: 0,
      skippedCount: 0,
      items: items.map(
        ({ token }: { token: { accountId: string; id: number } }) => ({
          id: `${token.accountId}:${token.id}`,
          accountName: token.accountId,
          tokenName: String(token.id),
          success: true,
          skipped: false,
        }),
      ),
    }))
  })

  it("toggles visible token selection from the toolbar", async () => {
    const user = userEvent.setup()
    renderTokenList()

    const visibleSelection = await screen.findByRole("checkbox", {
      name: "keyManagement:batchManagedSiteExport.selection.visible",
    })
    const token1Selection = await screen.findByRole("checkbox", {
      name: "Token 1",
    })
    const token2Selection = await screen.findByRole("checkbox", {
      name: "Token 2",
    })

    expect(token1Selection).not.toBeChecked()
    expect(token2Selection).not.toBeChecked()

    await user.click(visibleSelection)
    expect(token1Selection).toBeChecked()
    expect(token2Selection).toBeChecked()

    await user.click(visibleSelection)
    expect(token1Selection).not.toBeChecked()
    expect(token2Selection).not.toBeChecked()
  })

  it("prunes selected tokens that disappear after data refresh", async () => {
    const user = userEvent.setup()
    const { rerender } = renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    expect(screen.getByRole("checkbox", { name: "Token 1" })).toBeChecked()

    rerender(
      <TokenList
        {...(defaultProps as any)}
        tokens={[token2] as any}
        filteredTokens={[token2] as any}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "Token 1" })).toBeNull()
      expect(
        screen.getByRole("checkbox", { name: "Token 2" }),
      ).not.toBeChecked()
      expect(
        screen.getByRole("button", {
          name: /keyManagement:batchManagedSiteExport.actions.open/,
        }),
      ).toBeDisabled()
    })
  })

  it("clears the current selection from the toolbar", async () => {
    const user = userEvent.setup()
    renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(await screen.findByRole("checkbox", { name: "Token 2" }))
    expect(screen.getByRole("checkbox", { name: "Token 1" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Token 2" })).toBeChecked()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.clearSelection",
      }),
    )

    expect(screen.getByRole("checkbox", { name: "Token 1" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Token 2" })).not.toBeChecked()
    expect(
      screen.getByRole("button", {
        name: /keyManagement:batchManagedSiteExport.actions.open/,
      }),
    ).toBeDisabled()
  })

  it("shows the visible-selection checkbox as mixed when only part of the filtered list is selected", async () => {
    const user = userEvent.setup()
    renderTokenList()

    const visibleSelection = await screen.findByRole("checkbox", {
      name: "keyManagement:batchManagedSiteExport.selection.visible",
    })

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))

    expect(visibleSelection).toHaveAttribute("aria-checked", "mixed")
  })

  it("uses the frozen open-time selection for completion mapping", async () => {
    const user = userEvent.setup()
    const onManagedSiteImportSuccess = vi.fn()
    const { rerender } = renderTokenList({ onManagedSiteImportSuccess })
    mockBuildBatchExportResult.mockImplementation(() => ({
      totalSelected: 2,
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      skippedCount: 0,
      items: [
        {
          id: `${token1.accountId}:${token1.id}`,
          accountName: token1.accountId,
          tokenName: String(token1.id),
          success: true,
          skipped: false,
        },
        {
          id: `${token2.accountId}:${token2.id}`,
          accountName: token2.accountId,
          tokenName: String(token2.id),
          success: false,
          skipped: false,
        },
      ],
    }))

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(await screen.findByRole("checkbox", { name: "Token 2" }))
    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:batchManagedSiteExport.actions.open/,
      }),
    )

    expect(screen.getByTestId("batch-export-item-count")).toHaveTextContent("2")

    rerender(
      <TokenList
        {...(defaultProps as any)}
        tokens={[token2] as any}
        filteredTokens={[token2] as any}
        onManagedSiteImportSuccess={onManagedSiteImportSuccess}
      />,
    )

    expect(screen.getByTestId("batch-export-item-count")).toHaveTextContent("2")
    await user.click(
      screen.getByRole("button", { name: "Complete batch export" }),
    )

    expect(onManagedSiteImportSuccess).toHaveBeenCalledTimes(1)
    expect(onManagedSiteImportSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        id: token1.id,
        accountId: account.id,
      }),
    )
  })

  it("closes the batch export dialog without mutating the frozen selection", async () => {
    const user = userEvent.setup()
    renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:batchManagedSiteExport.actions.open/,
      }),
    )

    expect(screen.getByTestId("batch-export-dialog")).toBeInTheDocument()
    expect(screen.getByTestId("batch-export-item-count")).toHaveTextContent("1")

    await user.click(screen.getByRole("button", { name: "Close batch export" }))
    expect(screen.queryByTestId("batch-export-dialog")).toBeNull()
    expect(screen.getByRole("checkbox", { name: "Token 1" })).toBeChecked()
  })

  it("supports grouped selection and CC Switch actions", async () => {
    const user = userEvent.setup()
    renderTokenList({
      selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      displayData: [account] as any,
    })

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )
    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    expect(screen.getByRole("checkbox", { name: "Token 1" })).toBeChecked()

    await user.click(
      screen.getByRole("button", { name: "Open CC Switch for Token 1" }),
    )
    expect(screen.getByTestId("cc-switch-export-dialog")).toHaveTextContent(
      "CC Switch export for Account 1",
    )

    await user.click(
      screen.getByRole("button", { name: "Close CC Switch export" }),
    )
    expect(screen.queryByTestId("cc-switch-export-dialog")).toBeNull()
  })

  it("toggles all visible tokens in an account group from the group header", async () => {
    const user = userEvent.setup()
    renderTokenList({
      selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      displayData: [account, accountB] as any,
      tokens: [token1, token2, tokenB] as any,
      filteredTokens: [token1, token2, tokenB] as any,
    })

    const groupSelections = await screen.findAllByRole("checkbox", {
      name: "keyManagement:batchManagedSiteExport.selection.accountGroup",
    })

    await user.click(groupSelections[0])
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )

    expect(screen.getByRole("checkbox", { name: "Token 1" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Token 2" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Token B" })).not.toBeChecked()

    await user.click(groupSelections[0])

    expect(screen.getByRole("checkbox", { name: "Token 1" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Token 2" })).not.toBeChecked()
  })

  it("shows grouped filtered counts when a group is partially visible", async () => {
    const user = userEvent.setup()
    renderTokenList({
      selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      displayData: [account] as any,
      filteredTokens: [token1] as any,
    })

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )

    expect(screen.getByText("keyManagement:showingCount")).toBeInTheDocument()
  })

  it("opens the CC Switch dialog from the flat token list", async () => {
    const user = userEvent.setup()
    renderTokenList()

    await user.click(
      await screen.findByRole("button", {
        name: "Open CC Switch for Token 1",
      }),
    )

    expect(screen.getByTestId("cc-switch-export-dialog")).toHaveTextContent(
      "CC Switch export for Account 1",
    )
  })

  it("skips rendering flat-list tokens whose account metadata is missing", async () => {
    const orphanToken = createToken({
      id: 9,
      name: "Orphan Token",
      accountId: "missing-account",
      accountName: "Missing Account",
    })

    renderTokenList({
      tokens: [orphanToken] as any,
      filteredTokens: [orphanToken] as any,
    })

    await waitFor(() => {
      expect(
        screen.queryByRole("checkbox", { name: "Orphan Token" }),
      ).toBeNull()
      expect(
        screen.queryByRole("button", {
          name: "Open CC Switch for Orphan Token",
        }),
      ).toBeNull()
    })
  })
})
