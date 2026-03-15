import { beforeEach, describe, expect, it, vi } from "vitest"

import KeyManagement from "~/entrypoints/options/pages/KeyManagement"
import { MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS } from "~/services/managedSites/channelMatch"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
} from "~/services/managedSites/tokenChannelStatus"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  sendRuntimeActionMessageMock,
  tokenListPropsSpy,
  useKeyManagementMock,
  mockedUseUserPreferencesContext,
  openNewApiManagedVerificationMock,
  loadNewApiChannelKeyWithVerificationMock,
} = vi.hoisted(() => ({
  sendRuntimeActionMessageMock: vi.fn(),
  tokenListPropsSpy: vi.fn(),
  useKeyManagementMock: vi.fn(),
  mockedUseUserPreferencesContext: vi.fn(),
  openNewApiManagedVerificationMock: vi.fn(),
  loadNewApiChannelKeyWithVerificationMock: vi.fn(),
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
      openNewApiManagedVerification: openNewApiManagedVerificationMock,
      submitCode: vi.fn(),
      retryVerification: vi.fn(),
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
    loadNewApiChannelKeyWithVerification: (...args: unknown[]) =>
      loadNewApiChannelKeyWithVerificationMock(...args),
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
  tokens: [
    { id: 1, name: "Token 1", accountId: "acc-1", accountName: "Account 1" },
  ],
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
  filteredTokens: [
    { id: 1, name: "Token 1", accountId: "acc-1", accountName: "Account 1" },
  ],
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
  beforeEach(() => {
    sendRuntimeActionMessageMock.mockReset()
    tokenListPropsSpy.mockReset()
    useKeyManagementMock.mockReset()
    openNewApiManagedVerificationMock.mockReset()
    loadNewApiChannelKeyWithVerificationMock.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue({
      managedSiteType: "new-api",
      newApiBaseUrl: "https://managed.example",
      newApiUserId: "1",
      newApiUsername: "admin",
      newApiPassword: "secret-password",
      newApiTotpSecret: "JBSWY3DPEHPK3PXP",
    })
  })

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
    ).toEqual(expect.any(Function))
    expect(
      tokenListPropsSpy.mock.lastCall?.[0]?.onManagedSiteVerificationRetry,
    ).toEqual(expect.any(Function))
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
    expect(
      tokenListPropsSpy.mock.lastCall?.[0]?.onManagedSiteVerificationRetry,
    ).toBe(undefined)
  })

  it("tries the concrete channel key before opening verification when a candidate channel is known", async () => {
    sendRuntimeActionMessageMock.mockResolvedValue({ success: false })
    loadNewApiChannelKeyWithVerificationMock.mockResolvedValue(true)

    const refreshManagedSiteTokenStatusForToken = vi.fn()

    useKeyManagementMock.mockReturnValue({
      ...baseHookResult,
      isManagedSiteChannelStatusSupported: true,
      refreshManagedSiteTokenStatusForToken,
    })

    render(<KeyManagement />)

    await waitFor(() => expect(tokenListPropsSpy).toHaveBeenCalled())

    const retry = tokenListPropsSpy.mock.lastCall?.[0]
      ?.onManagedSiteVerificationRetry as
      | ((token: any, managedSiteStatus: any) => Promise<void>)
      | undefined

    await retry?.(baseHookResult.tokens[0] as any, {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      assessment: {
        searchBaseUrl: "https://example.com",
        searchCompleted: true,
        url: {
          matched: true,
          candidateCount: 1,
          channel: {
            id: 88,
            name: "Managed Channel 88",
          },
        },
        key: {
          comparable: false,
          matched: false,
          reason: "comparison-unavailable",
        },
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
          channel: {
            id: 88,
            name: "Managed Channel 88",
          },
        },
      },
      recovery: {
        siteType: "new-api",
        managedBaseUrl: "https://managed.example",
        searchBaseUrl: "https://example.com",
        loginCredentialsConfigured: true,
        authenticatedBrowserSessionExists: false,
        automaticCodeConfigured: true,
      },
    })

    expect(loadNewApiChannelKeyWithVerificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 88,
        requestKind: "token",
        label: "Token 1",
      }),
    )
    expect(refreshManagedSiteTokenStatusForToken).not.toHaveBeenCalled()
  })

  it("refreshes the token status before opening verification retry", async () => {
    sendRuntimeActionMessageMock.mockResolvedValue({ success: false })

    const refreshManagedSiteTokenStatusForToken = vi.fn().mockResolvedValue({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      recovery: {
        siteType: "new-api",
        managedBaseUrl: "https://managed.example",
        searchBaseUrl: "https://example.com",
        loginCredentialsConfigured: false,
        authenticatedBrowserSessionExists: true,
        automaticCodeConfigured: true,
      },
    })

    useKeyManagementMock.mockReturnValue({
      ...baseHookResult,
      isManagedSiteChannelStatusSupported: true,
      refreshManagedSiteTokenStatusForToken,
    })

    render(<KeyManagement />)

    await waitFor(() => expect(tokenListPropsSpy).toHaveBeenCalled())

    const retry = tokenListPropsSpy.mock.lastCall?.[0]
      ?.onManagedSiteVerificationRetry as
      | ((token: any, managedSiteStatus: any) => Promise<void>)
      | undefined

    expect(retry).toEqual(expect.any(Function))

    await retry?.(baseHookResult.tokens[0] as any, {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      recovery: {
        siteType: "new-api",
        managedBaseUrl: "https://managed.example",
        searchBaseUrl: "https://example.com",
        loginCredentialsConfigured: false,
        authenticatedBrowserSessionExists: true,
        automaticCodeConfigured: true,
      },
    })

    expect(refreshManagedSiteTokenStatusForToken).toHaveBeenCalledWith(
      baseHookResult.tokens[0],
    )
    expect(openNewApiManagedVerificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "token",
        label: "Token 1",
      }),
    )
  })

  it("skips the verification dialog when the refresh already resolves the token", async () => {
    sendRuntimeActionMessageMock.mockResolvedValue({ success: false })

    const refreshManagedSiteTokenStatusForToken = vi.fn().mockResolvedValue({
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED,
      assessment: {
        searchBaseUrl: "https://example.com",
        searchCompleted: true,
        url: {
          matched: false,
          candidateCount: 0,
        },
        key: {
          comparable: false,
          matched: false,
          reason: "comparison-unavailable",
        },
        models: {
          comparable: false,
          matched: false,
          reason: "comparison-unavailable",
        },
      },
    })

    useKeyManagementMock.mockReturnValue({
      ...baseHookResult,
      isManagedSiteChannelStatusSupported: true,
      refreshManagedSiteTokenStatusForToken,
    })

    render(<KeyManagement />)

    await waitFor(() => expect(tokenListPropsSpy).toHaveBeenCalled())

    const retry = tokenListPropsSpy.mock.lastCall?.[0]
      ?.onManagedSiteVerificationRetry as
      | ((token: any, managedSiteStatus: any) => Promise<void>)
      | undefined

    await retry?.(baseHookResult.tokens[0] as any, {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason:
        MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
      recovery: {
        siteType: "new-api",
        managedBaseUrl: "https://managed.example",
        searchBaseUrl: "https://example.com",
        loginCredentialsConfigured: true,
        authenticatedBrowserSessionExists: false,
        automaticCodeConfigured: true,
      },
    })

    expect(refreshManagedSiteTokenStatusForToken).toHaveBeenCalledWith(
      baseHookResult.tokens[0],
    )
    expect(openNewApiManagedVerificationMock).not.toHaveBeenCalled()
  })
})
