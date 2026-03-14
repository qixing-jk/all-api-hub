import { describe, expect, it, vi } from "vitest"

import KeyManagement from "~/entrypoints/options/pages/KeyManagement"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  sendRuntimeActionMessageMock,
  tokenListPropsSpy,
  useKeyManagementMock,
} = vi.hoisted(() => ({
  sendRuntimeActionMessageMock: vi.fn(),
  tokenListPropsSpy: vi.fn(),
  useKeyManagementMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeActionMessage: sendRuntimeActionMessageMock,
  }
})

vi.mock("~/features/KeyManagement/hooks/useKeyManagement", () => ({
  useKeyManagement: (...args: unknown[]) => useKeyManagementMock(...args),
}))

vi.mock("~/features/KeyManagement/components/AccountSelectorPanel", () => ({
  AccountSelectorPanel: () => <div data-testid="controls" />,
}))

vi.mock("~/features/KeyManagement/components/TokenList", () => ({
  TokenList: (props: any) => {
    tokenListPropsSpy(props)
    return <div data-testid="token-list" />
  },
}))

vi.mock("~/features/KeyManagement/components/Footer", () => ({
  Footer: () => <div data-testid="footer" />,
}))

vi.mock("~/features/KeyManagement/components/AddTokenDialog", () => ({
  default: () => null,
}))

vi.mock("~/features/KeyManagement/components/RepairMissingKeysDialog", () => ({
  RepairMissingKeysDialog: () => null,
}))

const baseHookResult = {
  displayData: [{ id: "acc-1", name: "Account 1", disabled: false }],
  selectedAccount: "acc-1",
  setSelectedAccount: vi.fn(),
  searchTerm: "",
  setSearchTerm: vi.fn(),
  tokens: [{ id: 1, accountId: "acc-1", accountName: "Account 1" }],
  isLoading: false,
  visibleKeys: new Set(),
  isAddTokenOpen: false,
  editingToken: null,
  tokenInventories: {},
  tokenLoadProgress: null,
  failedAccounts: [],
  accountSummaryItems: [],
  managedSiteTokenStatuses: {},
  isManagedSiteStatusRefreshing: false,
  allAccountsFilterAccountId: null,
  setAllAccountsFilterAccountId: vi.fn(),
  loadTokens: vi.fn(),
  filteredTokens: [{ id: 1, accountId: "acc-1", accountName: "Account 1" }],
  refreshManagedSiteTokenStatuses: vi.fn(),
  refreshManagedSiteTokenStatusForToken: vi.fn(),
  copyKey: vi.fn(),
  toggleKeyVisibility: vi.fn(),
  retryFailedAccounts: vi.fn(),
  handleAddToken: vi.fn(),
  handleCloseAddToken: vi.fn(),
  handleEditToken: vi.fn(),
  handleDeleteToken: vi.fn(),
}

describe("KeyManagement managed-site status support", () => {
  it("shows refresh controls and passes the post-import refresh callback when status checks are supported", async () => {
    sendRuntimeActionMessageMock.mockResolvedValue({ success: false })
    tokenListPropsSpy.mockReset()
    useKeyManagementMock.mockReturnValue({
      ...baseHookResult,
      isManagedSiteChannelStatusSupported: true,
    })

    render(<KeyManagement />)

    expect(
      await screen.findByRole("button", {
        name: "keyManagement:managedSiteStatus.actions.refresh",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:managedSiteStatus.pageUnsupported"),
    ).toBeNull()

    await waitFor(() => expect(tokenListPropsSpy).toHaveBeenCalled())
    expect(
      tokenListPropsSpy.mock.lastCall?.[0]?.onManagedSiteImportSuccess,
    ).toBe(baseHookResult.refreshManagedSiteTokenStatusForToken)
  })

  it("hides refresh controls, shows the unsupported hint, and omits the post-import refresh callback for Veloera", async () => {
    sendRuntimeActionMessageMock.mockResolvedValue({ success: false })
    tokenListPropsSpy.mockReset()
    useKeyManagementMock.mockReturnValue({
      ...baseHookResult,
      isManagedSiteChannelStatusSupported: false,
    })

    render(<KeyManagement />)

    await waitFor(() => expect(tokenListPropsSpy).toHaveBeenCalled())
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:managedSiteStatus.actions.refresh",
      }),
    ).toBeNull()
    expect(
      screen.getByText("keyManagement:managedSiteStatus.pageUnsupported"),
    ).toBeInTheDocument()
    expect(
      tokenListPropsSpy.mock.lastCall?.[0]?.onManagedSiteImportSuccess,
    ).toBe(undefined)
  })
})
