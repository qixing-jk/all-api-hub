import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TokenList } from "~/features/KeyManagement/components/TokenList"
import { render, screen, waitFor } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

vi.mock("~/features/KeyManagement/components/TokenListItem", () => ({
  TokenListItem: ({
    token,
    isSelected,
    onSelectionChange,
  }: {
    token: { name: string }
    isSelected?: boolean
    onSelectionChange?: (checked: boolean) => void
  }) => (
    <label>
      <input
        type="checkbox"
        checked={isSelected === true}
        onChange={(event) => onSelectionChange?.(event.currentTarget.checked)}
      />
      {token.name}
    </label>
  ),
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
            onClick={() =>
              onCompleted?.({
                totalSelected: items.length,
                attemptedCount: items.length,
                createdCount: items.length,
                failedCount: 0,
                skippedCount: 0,
                items: items.map(({ token }) => ({
                  id: `${token.accountId}:${token.id}`,
                  accountName: token.accountId,
                  tokenName: String(token.id),
                  success: true,
                  skipped: false,
                })),
              })
            }
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

  it("uses the frozen open-time selection for completion mapping", async () => {
    const user = userEvent.setup()
    const onManagedSiteImportSuccess = vi.fn()
    const { rerender } = renderTokenList({ onManagedSiteImportSuccess })

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:batchManagedSiteExport.actions.open/,
      }),
    )

    expect(screen.getByTestId("batch-export-item-count")).toHaveTextContent("1")

    rerender(
      <TokenList
        {...(defaultProps as any)}
        tokens={[token2] as any}
        filteredTokens={[token2] as any}
        onManagedSiteImportSuccess={onManagedSiteImportSuccess}
      />,
    )

    expect(screen.getByTestId("batch-export-item-count")).toHaveTextContent("1")
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
})
