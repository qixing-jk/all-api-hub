import { vi } from "vitest"

import type { UserPreferences } from "~/services/preferences/userPreferences"

/**
 * Shared mock declarations for the AccountActionButtons tests. Every split
 * test file must side-effect import this module as its FIRST import so the
 * hoisted vi.mock registrations apply to that test module graph.
 */

const {
  mockHandleSetAccountDisabled,
  mockHandleRefreshAccount,
  mockTogglePinAccount,
  fetchAccountTokensMock,
  fetchDisplayAccountInviteLinkMock,
  canFetchDisplayAccountInviteLinkMock,
  getManagedSiteServiceMock,
  openKeysPageMock,
  openManagedSiteChannelsForChannelMock,
  openManagedSiteChannelsPageMock,
  openModelsPageMock,
  sendRuntimeMessageMock,
  loadAccountDataMock,
  exportShareSnapshotWithToastMock,
  userPreferencesContextValue,
  accountDataContextValue,
  accountActionsContextValue,
  toastDismissMock,
  toastLoadingMock,
  toastSuccessMock,
  toastErrorMock,
  toastCustomMock,
  hasValidManagedSiteConfigMock,
  clipboardWriteTextMock,
  trackStartedMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  resolveProductAnalyticsErrorCategoryFromErrorMock,
  resolveDisplayAccountRuntimeKeySecretMock,
  resolveManagedUpstreamResourceFeatureCapabilitiesMock,
  getCurrentTempWindowRequestSourceMock,
  withProtectionBypassUserCommandMock,
} = vi.hoisted(() => ({
  mockHandleSetAccountDisabled: vi.fn(),
  mockHandleRefreshAccount: vi.fn(),
  mockTogglePinAccount: vi.fn(),
  fetchAccountTokensMock: vi.fn(),
  fetchDisplayAccountInviteLinkMock: vi.fn(),
  canFetchDisplayAccountInviteLinkMock: vi.fn(),
  getManagedSiteServiceMock: vi.fn(),
  openKeysPageMock: vi.fn(),
  openManagedSiteChannelsForChannelMock: vi.fn(),
  openManagedSiteChannelsPageMock: vi.fn(),
  openModelsPageMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  loadAccountDataMock: vi.fn(),
  exportShareSnapshotWithToastMock: vi.fn(),
  userPreferencesContextValue: {
    currencyType: "USD",
    showTodayCashflow: true,
    preferences: {
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://admin.example",
        adminToken: "t",
        userId: "1",
      },
    } as Partial<UserPreferences>,
  },
  accountDataContextValue: {
    isAccountPinned: vi.fn(() => false),
    togglePinAccount: vi.fn(),
    isPinFeatureEnabled: false,
    loadAccountData: vi.fn(),
  },
  accountActionsContextValue: {
    refreshingAccountId: null as string | null,
  },
  toastDismissMock: vi.fn(),
  toastLoadingMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastCustomMock: vi.fn(),
  hasValidManagedSiteConfigMock: vi.fn(() => true),
  clipboardWriteTextMock: vi.fn(),
  trackStartedMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  resolveProductAnalyticsErrorCategoryFromErrorMock: vi.fn(),
  resolveDisplayAccountRuntimeKeySecretMock: vi.fn(),
  resolveManagedUpstreamResourceFeatureCapabilitiesMock: vi.fn(),
  getCurrentTempWindowRequestSourceMock: vi.fn(),
  withProtectionBypassUserCommandMock: vi.fn(
    async (
      command: unknown,
      surface: unknown,
      work: (execution: unknown) => Promise<unknown>,
    ) =>
      work({
        version: 2,
        kind: "user_command",
        command,
        surface,
      }),
  ),
}))

vi.mock("~/utils/browser/tempWindowRequestSource", () => ({
  getCurrentTempWindowRequestSource: getCurrentTempWindowRequestSourceMock,
}))

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: toastDismissMock,
    loading: toastLoadingMock,
    success: toastSuccessMock,
    error: toastErrorMock,
    custom: toastCustomMock,
  },
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: getManagedSiteServiceMock,
  hasValidManagedSiteConfig: hasValidManagedSiteConfigMock,
}))

vi.mock("~/services/managedSites/managedUpstreamResourceService", () => ({
  resolveManagedUpstreamResourceFeatureCapabilities: (...args: unknown[]) =>
    resolveManagedUpstreamResourceFeatureCapabilitiesMock(...args),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  }
})

vi.mock("~/services/checkin/autoCheckin/messaging", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/checkin/autoCheckin/messaging")
    >()

  return {
    ...actual,
    sendAutoCheckinMessage: (type: string, data?: Record<string, unknown>) =>
      sendRuntimeMessageMock(type, data),
  }
})

vi.mock("~/services/protectionBypass/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/protectionBypass/client")>()
  return {
    ...actual,
    withProtectionBypassUserCommand: withProtectionBypassUserCommandMock,
  }
})

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    refreshingAccountId: accountActionsContextValue.refreshingAccountId,
    handleRefreshAccount: mockHandleRefreshAccount,
    handleSetAccountDisabled: mockHandleSetAccountDisabled,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => accountDataContextValue,
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openEditAccount: vi.fn(),
  }),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: any }) => children,
  useUserPreferencesContext: () => userPreferencesContextValue,
}))

vi.mock("~/utils/navigation", () => ({
  openKeysPage: openKeysPageMock,
  openManagedSiteChannelsForChannel: openManagedSiteChannelsForChannelMock,
  openManagedSiteChannelsPage: openManagedSiteChannelsPageMock,
  openModelsPage: openModelsPageMock,
  openRedeemPage: vi.fn(),
  openUsagePage: vi.fn(),
}))

vi.mock("~/features/ShareSnapshots/utils/exportShareSnapshotWithToast", () => ({
  exportShareSnapshotWithToast: exportShareSnapshotWithToastMock,
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    trackProductAnalyticsActionStarted: trackStartedMock,
    startProductAnalyticsAction: (...args: unknown[]) =>
      startProductAnalyticsActionMock(...args),
    resolveProductAnalyticsErrorCategoryFromError:
      resolveProductAnalyticsErrorCategoryFromErrorMock,
  }
})

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    const runtimeKeyHelpers = await import(
      "~/services/accounts/accountRuntimeKeys"
    )

    return {
      ...actual,
      fetchDisplayAccountTokens: async (...args: unknown[]) => {
        const result = await fetchAccountTokensMock(...args)
        if (Array.isArray(result)) {
          return result
        }

        throw new actual.InvalidTokenPayloadError({
          accountId: "test-account",
          baseUrl: "https://example.com",
          siteType: "test-site",
          responseType: typeof result,
        })
      },
      fetchDisplayAccountRuntimeKeys: async (...args: unknown[]) => {
        const result = await fetchAccountTokensMock(...args)
        if (Array.isArray(result)) {
          const account = args[0] as any
          return result.map((token) =>
            "source" in Object(token)
              ? token
              : runtimeKeyHelpers.buildDisplayAccountTokenRuntimeKey(
                  account,
                  token as any,
                ),
          )
        }

        throw new actual.InvalidTokenPayloadError({
          accountId: "test-account",
          baseUrl: "https://example.com",
          siteType: "test-site",
          responseType: typeof result,
        })
      },
      fetchDisplayAccountInviteLink: (...args: unknown[]) =>
        fetchDisplayAccountInviteLinkMock(...args),
      canFetchDisplayAccountInviteLink: (...args: unknown[]) =>
        canFetchDisplayAccountInviteLinkMock(...args),
      resolveDisplayAccountTokenForSecret: async () => {
        throw new Error(
          "resolveDisplayAccountTokenForSecret should not be used by account row actions",
        )
      },
      resolveDisplayAccountRuntimeKeySecret: async (
        account: unknown,
        runtimeKey: { secret: string },
      ) => resolveDisplayAccountRuntimeKeySecretMock(account, runtimeKey),
    }
  },
)

export {
  mockHandleSetAccountDisabled,
  mockHandleRefreshAccount,
  mockTogglePinAccount,
  fetchAccountTokensMock,
  fetchDisplayAccountInviteLinkMock,
  canFetchDisplayAccountInviteLinkMock,
  getManagedSiteServiceMock,
  openKeysPageMock,
  openManagedSiteChannelsForChannelMock,
  openManagedSiteChannelsPageMock,
  openModelsPageMock,
  sendRuntimeMessageMock,
  loadAccountDataMock,
  exportShareSnapshotWithToastMock,
  userPreferencesContextValue,
  accountDataContextValue,
  accountActionsContextValue,
  toastDismissMock,
  toastLoadingMock,
  toastSuccessMock,
  toastErrorMock,
  toastCustomMock,
  hasValidManagedSiteConfigMock,
  clipboardWriteTextMock,
  trackStartedMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  resolveProductAnalyticsErrorCategoryFromErrorMock,
  resolveDisplayAccountRuntimeKeySecretMock,
  resolveManagedUpstreamResourceFeatureCapabilitiesMock,
  getCurrentTempWindowRequestSourceMock,
  withProtectionBypassUserCommandMock,
}
