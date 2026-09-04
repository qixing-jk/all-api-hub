import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { TokenList } from "~/features/KeyManagement/components/TokenList"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { KEY_MANAGEMENT_LOAD_STATUSES } from "~/features/KeyManagement/types"
import { buildServiceCredentialRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

const {
  mockCompleteProductAnalyticsAction,
  mockTrackProductAnalyticsActionCompleted,
  mockTrackProductAnalyticsActionStarted,
  mockExecuteManagedSiteTokenBatchExport,
  mockPrepareManagedSiteTokenBatchExportPreview,
  mockSaveApiCredentialProfiles,
  mockStartProductAnalyticsAction,
} = vi.hoisted(() => ({
  mockCompleteProductAnalyticsAction: vi.fn(),
  mockTrackProductAnalyticsActionCompleted: vi.fn(),
  mockTrackProductAnalyticsActionStarted: vi.fn(),
  mockExecuteManagedSiteTokenBatchExport: vi.fn(),
  mockPrepareManagedSiteTokenBatchExportPreview: vi.fn(),
  mockSaveApiCredentialProfiles: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    mockStartProductAnalyticsAction(...args),
  trackProductAnalyticsActionCompleted: (...args: unknown[]) =>
    mockTrackProductAnalyticsActionCompleted(...args),
  trackProductAnalyticsActionStarted: (...args: unknown[]) =>
    mockTrackProductAnalyticsActionStarted(...args),
}))

vi.mock(
  "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction",
  () => ({
    saveAccountRuntimeKeysToApiCredentialProfiles: (...args: unknown[]) =>
      mockSaveApiCredentialProfiles(...args),
  }),
)

vi.mock("~/features/KeyManagement/components/TokenListItem", () => ({
  TokenListItem: ({
    token,
    isSelected,
    onSelectionChange,
    selectionDisabledReason,
    onOpenCCSwitchDialog,
  }: {
    token: { name: string }
    isSelected?: boolean
    onSelectionChange?: (checked: boolean) => void
    selectionDisabledReason?: string
    onOpenCCSwitchDialog?: () => void
  }) => (
    <div>
      {onSelectionChange || selectionDisabledReason ? (
        <label>
          <input
            type="checkbox"
            checked={isSelected === true}
            disabled={!onSelectionChange}
            onChange={(event) =>
              onSelectionChange?.(event.currentTarget.checked)
            }
          />
          {token.name}
        </label>
      ) : (
        <span>{token.name}</span>
      )}
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
  "~/features/KeyManagement/components/BatchCliProxyExportDialog",
  () => ({
    BatchCliProxyExportDialog: ({
      isOpen,
      items,
      onClose,
    }: {
      isOpen: boolean
      items: Array<Record<string, unknown>>
      onClose: () => void
    }) =>
      isOpen ? (
        <div data-testid="batch-cli-proxy-export-dialog">
          <div data-testid="batch-cli-proxy-export-item-count">
            {items.length}
          </div>
          <button type="button" onClick={onClose}>
            Close batch CLIProxy import
          </button>
        </div>
      ) : null,
  }),
)

vi.mock("~/services/managedSites/tokenBatchExport", () => ({
  executeManagedSiteTokenBatchExport: (...args: unknown[]) =>
    mockExecuteManagedSiteTokenBatchExport(...args),
  prepareManagedSiteTokenBatchExportPreview: (...args: unknown[]) =>
    mockPrepareManagedSiteTokenBatchExportPreview(...args),
}))

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
    { withFeatureGuidanceProvider: true },
  )

describe("TokenList batch export selection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSaveApiCredentialProfiles.mockResolvedValue({ savedCount: 2 })
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
    mockPrepareManagedSiteTokenBatchExportPreview.mockImplementation(
      ({ items }) => ({
        intent: {
          source: "manual-selection",
          verification: "complete",
        },
        siteType: "new-api",
        totalCount: items.length,
        readyCount: items.length,
        warningCount: 0,
        skippedCount: 0,
        blockedCount: 0,
        items: items.map(
          ({
            account,
            runtimeKey,
          }: {
            account: { id: string; name: string }
            runtimeKey: { id: string; label: string }
          }) => ({
            id: runtimeKey.id,
            accountId: account.id,
            accountName: account.name,
            runtimeKeyId: runtimeKey.id,
            runtimeKeyName: runtimeKey.label,
            draft: {
              name: runtimeKey.label,
              base_url: "https://example.invalid/v1",
              key: "sk-test",
              models: ["model-a"],
              groups: ["default"],
            },
            status: "ready",
            warningCodes: [],
          }),
        ),
      }),
    )
    mockExecuteManagedSiteTokenBatchExport.mockImplementation(
      ({ selectedItemIds }) => ({
        totalSelected: selectedItemIds.length,
        attemptedCount: selectedItemIds.length,
        createdCount: selectedItemIds.length,
        failedCount: 0,
        skippedCount: 0,
        items: selectedItemIds.map((id: string) => ({
          id,
          accountName: id.split(":")[0],
          tokenName: id.split(":")[1],
          success: true,
          skipped: false,
        })),
      }),
    )
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

  it("excludes create-response-only keys from selection in a mixed inventory", async () => {
    const user = userEvent.setup()
    const recoverableAccount = createAccount({
      id: "recoverable-account",
      name: "Recoverable account",
      siteType: SITE_TYPES.NEW_API,
    })
    const createOnlyAccount = createAccount({
      id: "create-only-account",
      name: "Create-only account",
      siteType: SITE_TYPES.AIHUBMIX,
    })
    const recoverableToken = createToken({
      id: 1,
      name: "Recoverable key",
      accountId: recoverableAccount.id,
      accountName: recoverableAccount.name,
    })
    const createOnlyToken = createToken({
      id: 2,
      name: "Create-only key",
      accountId: createOnlyAccount.id,
      accountName: createOnlyAccount.name,
    })

    renderTokenList({
      selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      displayData: [recoverableAccount, createOnlyAccount] as any,
      tokens: [recoverableToken, createOnlyToken] as any,
      filteredTokens: [recoverableToken, createOnlyToken] as any,
    })

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )

    expect(
      await screen.findByRole("checkbox", { name: "Recoverable key" }),
    ).toBeVisible()
    expect(
      screen.getByRole("checkbox", { name: "Create-only key" }),
    ).toBeDisabled()
    const groupSelections = screen.getAllByRole("checkbox", {
      name: "keyManagement:batchManagedSiteExport.selection.accountGroup",
    })
    expect(groupSelections).toHaveLength(2)
    expect(
      groupSelections.filter(
        (selection) => selection.getAttribute("aria-disabled") === "true",
      ),
    ).toHaveLength(1)
    expect(
      screen.getByText(/keyManagement:batchSelection\.eligibilityNotice/),
    ).toBeVisible()
  })

  it("hides the batch toolbar for an AIHubMix-only inventory", async () => {
    const createOnlyAccount = createAccount({
      id: "create-only-account",
      name: "Create-only account",
      siteType: SITE_TYPES.AIHUBMIX,
    })
    const createOnlyToken = createToken({
      id: 1,
      name: "Create-only key",
      accountId: createOnlyAccount.id,
      accountName: createOnlyAccount.name,
    })

    renderTokenList({
      selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      displayData: [createOnlyAccount] as any,
      tokens: [createOnlyToken] as any,
      filteredTokens: [createOnlyToken] as any,
    })

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )

    expect(await screen.findByText("Create-only key")).toBeVisible()
    expect(
      screen.getByRole("checkbox", {
        name: "keyManagement:batchManagedSiteExport.selection.accountGroup",
      }),
    ).toHaveAttribute("aria-disabled", "true")
    expect(
      screen.getByRole("checkbox", { name: "Create-only key" }),
    ).toBeDisabled()
    expect(
      screen.queryByRole("checkbox", {
        name: "keyManagement:batchManagedSiteExport.selection.visible",
      }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: /keyManagement:batchManagedSiteExport.actions.open/,
      }),
    ).toBeNull()
    expect(
      screen.queryByText(/keyManagement:batchSelection\.eligibilityNotice/),
    ).toBeNull()
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
    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(await screen.findByRole("checkbox", { name: "Token 2" }))
    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:batchManagedSiteExport.actions.open/,
      }),
    )

    expect(
      await screen.findByText("keyManagement:batchManagedSiteExport.title"),
    ).toBeVisible()
    await waitFor(() =>
      expect(
        screen.getByTestId(
          KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportStartButton,
        ),
      ).toBeEnabled(),
    )
    expect(mockPrepareManagedSiteTokenBatchExportPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: {
          source: "manual-selection",
          verification: "complete",
        },
      }),
    )

    rerender(
      <TokenList
        {...(defaultProps as any)}
        tokens={[token1, token2] as any}
        filteredTokens={[token2] as any}
        onManagedSiteImportSuccess={onManagedSiteImportSuccess}
      />,
    )

    await user.click(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportStartButton,
      ),
    )
    const startButtons = await screen.findAllByRole("button", {
      name: "keyManagement:batchManagedSiteExport.actions.start",
    })
    await user.click(
      startButtons.find(
        (button) =>
          button !==
          screen.getByTestId(
            KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportStartButton,
          ),
      ) as HTMLElement,
    )

    expect(onManagedSiteImportSuccess).toHaveBeenCalledTimes(2)
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

    expect(
      await screen.findByText("keyManagement:batchManagedSiteExport.title"),
    ).toBeVisible()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.gatewayDescription",
      ),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )
    await waitFor(() =>
      expect(
        screen.queryByText("keyManagement:batchManagedSiteExport.title"),
      ).toBeNull(),
    )
    expect(screen.getByRole("checkbox", { name: "Token 1" })).toBeChecked()
  })

  it("closes an open managed-site batch export when eligibility is revoked", async () => {
    const user = userEvent.setup()
    const { rerender } = renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:batchManagedSiteExport.actions.open/,
      }),
    )
    expect(
      await screen.findByText("keyManagement:batchManagedSiteExport.title"),
    ).toBeVisible()
    await waitFor(() =>
      expect(
        screen.getByTestId(
          KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportStartButton,
        ),
      ).toBeEnabled(),
    )
    await user.click(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportStartButton,
      ),
    )
    const confirmation = await screen.findByRole("dialog", {
      name: "keyManagement:batchManagedSiteExport.confirm.title",
    })
    within(confirmation).getByRole("button", {
      name: "keyManagement:batchManagedSiteExport.actions.start",
    })

    const createResponseOnlyAccount = createAccount({
      id: account.id,
      name: account.name,
      siteType: SITE_TYPES.AIHUBMIX,
    })
    rerender(
      <TokenList
        {...(defaultProps as any)}
        displayData={[createResponseOnlyAccount] as any}
        tokens={[token1, token2] as any}
        filteredTokens={[token1, token2] as any}
      />,
    )

    expect(
      screen.queryByRole("dialog", {
        name: "keyManagement:batchManagedSiteExport.confirm.title",
      }),
    ).toBeNull()
    await waitFor(() => {
      expect(
        screen.queryByText("keyManagement:batchManagedSiteExport.title"),
      ).toBeNull()
    })
    expect(mockExecuteManagedSiteTokenBatchExport).not.toHaveBeenCalled()
  })

  it("closes an open batch export when a selected token disappears", async () => {
    const user = userEvent.setup()
    const { rerender } = renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:batchManagedSiteExport.actions.open/,
      }),
    )
    expect(
      await screen.findByText("keyManagement:batchManagedSiteExport.title"),
    ).toBeVisible()

    rerender(
      <TokenList
        {...(defaultProps as any)}
        tokens={[token2] as any}
        filteredTokens={[token2] as any}
      />,
    )

    await waitFor(() => {
      expect(
        screen.queryByText("keyManagement:batchManagedSiteExport.title"),
      ).toBeNull()
    })
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

  it("closes the CC Switch dialog when the current token becomes non-exportable", async () => {
    const user = userEvent.setup()
    const { rerender } = renderTokenList()

    await user.click(
      await screen.findByRole("button", {
        name: "Open CC Switch for Token 1",
      }),
    )
    expect(screen.getByTestId("cc-switch-export-dialog")).toBeInTheDocument()

    const createResponseOnlyAccount = createAccount({
      id: account.id,
      name: account.name,
      siteType: SITE_TYPES.AIHUBMIX,
    })
    const currentToken = createToken({
      ...token1,
      key: "masked-create-response-only",
    })
    rerender(
      <TokenList
        {...(defaultProps as any)}
        displayData={[createResponseOnlyAccount] as any}
        tokens={[currentToken] as any}
        filteredTokens={[currentToken] as any}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByTestId("cc-switch-export-dialog")).toBeNull()
    })
  })

  it("opens the batch CLIProxyAPI dialog with the frozen selected tokens", async () => {
    const user = userEvent.setup()
    const { rerender } = renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(await screen.findByRole("checkbox", { name: "Token 2" }))
    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:batchCliProxyExport.actions.open/,
      }),
    )

    expect(
      screen.getByTestId("batch-cli-proxy-export-item-count"),
    ).toHaveTextContent("2")

    rerender(
      <TokenList
        {...(defaultProps as any)}
        tokens={[token1, token2] as any}
        filteredTokens={[token2] as any}
      />,
    )

    expect(
      screen.getByTestId("batch-cli-proxy-export-item-count"),
    ).toHaveTextContent("2")

    await user.click(
      screen.getByRole("button", { name: "Close batch CLIProxy import" }),
    )

    expect(
      screen.queryByTestId("batch-cli-proxy-export-dialog"),
    ).not.toBeInTheDocument()
  })

  it("closes an open CLIProxy batch export when eligibility is revoked", async () => {
    const user = userEvent.setup()
    const { rerender } = renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:batchCliProxyExport.actions.open/,
      }),
    )
    expect(
      screen.getByTestId("batch-cli-proxy-export-dialog"),
    ).toBeInTheDocument()

    const createResponseOnlyAccount = createAccount({
      id: account.id,
      name: account.name,
      siteType: SITE_TYPES.AIHUBMIX,
    })
    rerender(
      <TokenList
        {...(defaultProps as any)}
        displayData={[createResponseOnlyAccount] as any}
        tokens={[token1, token2] as any}
        filteredTokens={[token1, token2] as any}
      />,
    )

    await waitFor(() => {
      expect(
        screen.queryByTestId("batch-cli-proxy-export-dialog"),
      ).not.toBeInTheDocument()
    })
  })

  it("saves the selected tokens to API credential profiles and clears selection", async () => {
    const user = userEvent.setup()
    renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(await screen.findByRole("checkbox", { name: "Token 2" }))

    const saveButton = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.batchSaveToApiProfilesButton,
    )
    expect(saveButton).toBeEnabled()

    await user.click(saveButton)

    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountRuntimeKeysToApiCredentialProfiles,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockSaveApiCredentialProfiles).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: "runtime_key:account_token:acc-1:1",
            runtimeKey: expect.objectContaining({
              id: "account_token:acc-1:1",
              account: expect.objectContaining({ id: account.id }),
              token: expect.objectContaining({ id: token1.id }),
            }),
          }),
          expect.objectContaining({
            id: "runtime_key:account_token:acc-1:2",
            runtimeKey: expect.objectContaining({
              id: "account_token:acc-1:2",
              account: expect.objectContaining({ id: account.id }),
              token: expect.objectContaining({ id: token2.id }),
            }),
          }),
        ],
        source: "TokenListBatchAction",
      }),
    )
    expect(screen.getByRole("checkbox", { name: "Token 1" })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Token 2" })).not.toBeChecked()
    expect(saveButton).toBeDisabled()
  })

  it("shows a shared saving state, suppresses duplicate saves, and restores the count label after rejection", async () => {
    const user = userEvent.setup()
    const deferredSave = createDeferred<{ savedCount: number }>()
    mockSaveApiCredentialProfiles.mockReturnValueOnce(deferredSave.promise)
    renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.batchSaveToApiProfilesButton),
    )

    const savingButton = screen.getByRole("button", {
      name: "common:status.saving",
    })
    expect(savingButton).toHaveAttribute("aria-busy", "true")
    expect(savingButton).toBeDisabled()

    await user.click(savingButton)
    expect(mockSaveApiCredentialProfiles).toHaveBeenCalledTimes(1)

    deferredSave.reject(new Error("storage failed"))

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /keyManagement:batchApiCredentialProfiles.actions.open/,
        }),
      ).toBeEnabled()
    })
    expect(
      screen.getByRole("button", {
        name: /keyManagement:batchApiCredentialProfiles.actions.open/,
      }),
    ).not.toHaveAttribute("aria-busy")
  })

  it("includes selected service credentials in API profile, CLIProxy, and managed-site export actions", async () => {
    const user = userEvent.setup()
    const sharedChatAccount = createAccount({
      id: "sharedchat-account",
      name: "SharedChat",
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://sharedchat.example.invalid",
    })

    const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(
      sharedChatAccount as any,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex API Key",
        key: "sk-sharedchat",
        baseUrl: "https://sharedchat.example.invalid/v1",
        isAuthenticated: true,
      },
      { canRotate: true },
    )
    const serviceCredentialEntry = {
      id: "runtime_key:service_credential:sharedchat-account:codex",
      runtimeKey: serviceCredentialRuntimeKey,
      uiState: {
        isRotating: false,
      },
    }

    renderTokenList({
      selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      displayData: [sharedChatAccount] as any,
      tokens: [],
      filteredTokens: [],
      entries: [serviceCredentialEntry] as any,
      filteredEntries: [serviceCredentialEntry] as any,
      onCopyServiceCredential: vi.fn(),
      onRotateServiceCredential: vi.fn(),
    })

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.expandAll",
      }),
    )
    await user.click(
      await screen.findByRole("checkbox", { name: "Codex API Key" }),
    )

    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:batchCliProxyExport.actions.open/,
      }),
    )

    expect(
      screen.getByTestId("batch-cli-proxy-export-item-count"),
    ).toHaveTextContent("1")

    await user.click(
      screen.getByRole("button", { name: "Close batch CLIProxy import" }),
    )

    const managedSiteExportButton = screen.getByRole("button", {
      name: /keyManagement:batchManagedSiteExport.actions.open/,
    })
    expect(managedSiteExportButton).toBeEnabled()

    await user.click(managedSiteExportButton)

    expect(mockPrepareManagedSiteTokenBatchExportPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            account: expect.objectContaining({ id: sharedChatAccount.id }),
            runtimeKey: expect.objectContaining({
              id: serviceCredentialRuntimeKey.id,
            }),
          }),
        ],
        resolvedChannelKeysByItemId: {},
      }),
    )
    expect(
      await screen.findByText("keyManagement:batchManagedSiteExport.title"),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.batchSaveToApiProfilesButton),
    )

    expect(mockSaveApiCredentialProfiles).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [serviceCredentialEntry],
      }),
    )
  })

  it("omits service credential entries when no copy handler can render them", () => {
    const sharedChatAccount = createAccount({
      id: "sharedchat-account",
      name: "SharedChat",
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://sharedchat.example.invalid",
    })

    renderTokenList({
      selectedAccount: sharedChatAccount.id,
      displayData: [sharedChatAccount] as any,
      tokens: [],
      filteredTokens: [],
      serviceCredentials: {
        [sharedChatAccount.id]: {
          status: KEY_MANAGEMENT_LOAD_STATUSES.Loaded,
          credential: {
            kind: "singleton_service_key",
            service: "codex",
            label: "Codex API Key",
            key: "sk-sharedchat",
            baseUrl: "https://sharedchat.example.invalid/v1",
            isAuthenticated: true,
          },
        },
      },
    })

    expect(
      screen.queryByRole("button", {
        name: /keyManagement:batchCliProxyExport.actions.open/,
      }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("Codex API Key")).not.toBeInTheDocument()
  })

  it("keeps selected tokens available and tracks failure when API profile batch save fails", async () => {
    const user = userEvent.setup()
    mockSaveApiCredentialProfiles.mockRejectedValueOnce(
      new Error("storage failed"),
    )
    renderTokenList()

    await user.click(await screen.findByRole("checkbox", { name: "Token 1" }))

    const saveButton = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.batchSaveToApiProfilesButton,
    )
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        "failure",
        {
          errorCategory: "unknown",
        },
      )
    })
    expect(screen.getByRole("checkbox", { name: "Token 1" })).toBeChecked()
    expect(saveButton).toBeEnabled()
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
