import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import KeyManagement from "~/entrypoints/options/pages/KeyManagement"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { render, screen, waitFor } from "~~/tests/test-utils/render"
import { createAccount } from "~~/tests/utils/keyManagementFactories"

const {
  sendRuntimeActionMessageMock,
  tokenListPropsSpy,
  useKeyManagementMock,
  pushWithinOptionsPageMock,
  mockedUseUserPreferencesContext,
  addTokenDialogPropsSpy,
  accountSummaryBarPropsSpy,
} = vi.hoisted(() => ({
  sendRuntimeActionMessageMock: vi.fn(),
  tokenListPropsSpy: vi.fn(),
  useKeyManagementMock: vi.fn(),
  pushWithinOptionsPageMock: vi.fn(),
  mockedUseUserPreferencesContext: vi.fn(),
  addTokenDialogPropsSpy: vi.fn(),
  accountSummaryBarPropsSpy: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    sendRuntimeActionMessage: sendRuntimeActionMessageMock,
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    pushWithinOptionsPage: pushWithinOptionsPageMock,
  }
})

vi.mock("~/features/KeyManagement/hooks/useKeyManagement", () => ({
  useKeyManagement: (...args: unknown[]) => useKeyManagementMock(...args),
}))

vi.mock(
  "~/features/ManagedSiteVerification/useNewApiManagedVerification",
  () => ({
    useNewApiManagedVerification: () => ({
      dialogState: {
        isOpen: false,
        step: "logging-in",
        request: null,
        code: "",
        errorMessage: undefined,
        isBusy: false,
        busyMessage: undefined,
      },
      setCode: vi.fn(),
      closeDialog: vi.fn(),
      openBaseUrl: vi.fn(),
      openNewApiManagedVerification: vi.fn(),
      submitCode: vi.fn(),
      retryVerification: vi.fn(),
      patchRequestConfig: vi.fn(),
    }),
  }),
)

vi.mock(
  "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog",
  () => ({
    NewApiManagedVerificationDialog: () => null,
  }),
)

vi.mock(
  "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification",
  () => ({
    loadNewApiChannelKeyWithVerification: vi.fn(),
  }),
)

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
  }
})

vi.mock("~/features/KeyManagement/components/AccountSelectorPanel", () => {
  function MockAccountSelectorPanel(props: { selectorOpen?: boolean }) {
    const { selectorOpen } = props

    return (
      <button type="button" role="combobox" aria-expanded={selectorOpen}>
        Mock account selector
      </button>
    )
  }

  return {
    AccountSelectorPanel: MockAccountSelectorPanel,
  }
})

vi.mock("~/features/KeyManagement/components/TokenList", () => ({
  TokenList: (props: any) => {
    tokenListPropsSpy(props)

    return (
      <div>
        <button type="button" onClick={props.onAddAccount}>
          trigger-add-account
        </button>
        <button type="button" onClick={props.onRequestAccountSelection}>
          trigger-account-selection
        </button>
      </div>
    )
  },
}))

vi.mock("~/features/KeyManagement/components/Footer", () => ({
  Footer: () => null,
}))

vi.mock("~/features/KeyManagement/components/AccountSummaryBar", () => ({
  AccountSummaryBar: (props: any) => {
    accountSummaryBarPropsSpy(props)

    return (
      <div>
        {props.items.map((item: any) => (
          <button
            key={item.accountId}
            type="button"
            onClick={() => props.onAccountClick?.(item.accountId)}
          >
            Summary {item.name}:{item.count}
          </button>
        ))}
      </div>
    )
  },
}))

vi.mock("~/features/KeyManagement/components/AddTokenDialog", () => ({
  default: (props: any) => {
    addTokenDialogPropsSpy(props)
    return null
  },
}))

vi.mock("~/features/KeyManagement/components/RepairMissingKeysDialog", () => ({
  RepairMissingKeysDialog: () => null,
}))

const createHookResult = (
  overrides: Partial<Record<string, unknown>> = {},
) => ({
  displayData: [],
  selectedAccount: "",
  setSelectedAccount: vi.fn(),
  searchTerm: "",
  setSearchTerm: vi.fn(),
  tokens: [],
  isLoading: false,
  visibleKeys: new Set(),
  resolvingVisibleKeys: new Set(),
  isAddTokenOpen: false,
  editingToken: null,
  tokenLoadProgress: null,
  failedAccounts: [],
  accountSummaryItems: [],
  managedSiteTokenStatuses: {},
  isManagedSiteChannelStatusSupported: true,
  isManagedSiteStatusRefreshing: false,
  allAccountsFilterAccountIds: [],
  setAllAccountsFilterAccountIds: vi.fn(),
  loadTokens: vi.fn(),
  filteredTokens: [],
  getVisibleTokenKey: vi.fn(),
  refreshManagedSiteTokenStatuses: vi.fn(),
  refreshManagedSiteTokenStatusForToken: vi.fn(),
  copyKey: vi.fn(),
  toggleKeyVisibility: vi.fn(),
  retryFailedAccounts: vi.fn(),
  handleAddToken: vi.fn(),
  handleCloseAddToken: vi.fn(),
  handleEditToken: vi.fn(),
  handleDeleteToken: vi.fn(),
  ...overrides,
})

describe("KeyManagement empty-state actions", () => {
  beforeEach(() => {
    sendRuntimeActionMessageMock.mockReset()
    tokenListPropsSpy.mockReset()
    useKeyManagementMock.mockReset()
    pushWithinOptionsPageMock.mockReset()
    addTokenDialogPropsSpy.mockReset()
    accountSummaryBarPropsSpy.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: "new-api",
      newApiBaseUrl: "https://managed.example",
      newApiUserId: "1",
      newApiUsername: "admin",
      newApiPassword: "secret-password",
      newApiTotpSecret: "JBSWY3DPEHPK3PXP",
    })
    sendRuntimeActionMessageMock.mockResolvedValue({ success: false })
  })

  it("routes the no-account CTA to account management", async () => {
    const user = userEvent.setup()

    useKeyManagementMock.mockReturnValue(createHookResult())

    render(<KeyManagement />)

    await user.click(
      await screen.findByRole("button", {
        name: "trigger-add-account",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith("#account")
  })

  it("opens the account selector when the user needs to choose an account first", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "acc-1",
      name: "Account 1",
    })

    useKeyManagementMock.mockReturnValue(
      createHookResult({
        displayData: [account],
      }),
    )

    render(<KeyManagement />)

    const selectorTrigger = await screen.findByRole("combobox")

    expect(selectorTrigger).toHaveAttribute("aria-expanded", "false")

    await user.click(
      await screen.findByRole("button", {
        name: "trigger-account-selection",
      }),
    )

    await waitFor(() =>
      expect(selectorTrigger).toHaveAttribute("aria-expanded", "true"),
    )
  })

  it("preselects the filtered account in the add-token dialog while viewing all accounts", async () => {
    const account = createAccount({
      id: "acc-1",
      name: "Account 1",
    })

    useKeyManagementMock.mockReturnValue(
      createHookResult({
        displayData: [account],
        selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
        allAccountsFilterAccountIds: [account.id],
        isAddTokenOpen: true,
      }),
    )

    render(<KeyManagement />)

    await waitFor(() => expect(addTokenDialogPropsSpy).toHaveBeenCalled())

    expect(addTokenDialogPropsSpy.mock.lastCall?.[0]).toMatchObject({
      isOpen: true,
      preSelectedAccountId: account.id,
    })
  })

  it("does not preselect an account in the add-token dialog when multiple accounts are filtered", async () => {
    const accountA = createAccount({
      id: "acc-1",
      name: "Account 1",
    })
    const accountB = createAccount({
      id: "acc-2",
      name: "Account 2",
    })

    useKeyManagementMock.mockReturnValue(
      createHookResult({
        displayData: [accountA, accountB],
        selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
        allAccountsFilterAccountIds: [accountA.id, accountB.id],
        isAddTokenOpen: true,
      }),
    )

    render(<KeyManagement />)

    await waitFor(() => expect(addTokenDialogPropsSpy).toHaveBeenCalled())

    expect(addTokenDialogPropsSpy.mock.lastCall?.[0]).toMatchObject({
      isOpen: true,
      preSelectedAccountId: null,
    })
  })

  it("toggles the all-accounts summary filter for the clicked account", async () => {
    const user = userEvent.setup()
    const account = createAccount({
      id: "acc-1",
      name: "Account 1",
    })
    const setAllAccountsFilterAccountIds = vi.fn()

    useKeyManagementMock.mockReturnValue(
      createHookResult({
        displayData: [account],
        selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
        accountSummaryItems: [
          {
            accountId: account.id,
            name: account.name,
            count: 2,
          },
        ],
        setAllAccountsFilterAccountIds,
      }),
    )

    render(<KeyManagement />)

    await user.click(
      await screen.findByRole("button", {
        name: `Summary ${account.name}:2`,
      }),
    )

    expect(setAllAccountsFilterAccountIds).toHaveBeenCalledWith(
      expect.any(Function),
    )

    const toggleFilter = setAllAccountsFilterAccountIds.mock.lastCall?.[0]
    expect(toggleFilter([])).toEqual([account.id])
    expect(toggleFilter([account.id])).toEqual([])
  })
})
