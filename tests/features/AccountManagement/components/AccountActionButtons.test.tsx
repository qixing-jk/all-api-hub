import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import * as inviteLinkCopyWorkflow from "~/features/AccountManagement/inviteLinkCopyWorkflow"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import { MANAGED_UPSTREAM_RESOURCE_FEATURES } from "~/services/managedSites/managedUpstreamResourceMigration"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
} from "~/services/productAnalytics/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import {
  MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS,
  MANAGED_UPSTREAM_RESOURCE_SECRET_STATES,
  MANAGED_UPSTREAM_RESOURCE_STATUSES,
  type ManagedUpstreamResourceSummary,
} from "~/types/managedUpstreamResource"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render } from "~~/tests/test-utils/render"

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

const copyInviteLinkFromRowMenu = async (
  accountId: string,
  user = userEvent.setup(),
) => {
  render(
    <AccountActionButtons
      site={buildDisplaySiteData({
        id: accountId,
        disabled: false,
        siteType: SITE_TYPES.NEW_API,
      })}
      onCopyKey={vi.fn()}
      onDeleteAccount={vi.fn()}
    />,
  )

  await user.click(screen.getByRole("button", { name: "common:actions.more" }))
  await user.click(
    await screen.findByRole("menuitem", {
      name: "account:actions.copyInviteLink",
    }),
  )

  return user
}

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

describe("AccountActionButtons", () => {
  beforeEach(() => {
    getCurrentTempWindowRequestSourceMock.mockReturnValue(
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    })

    mockTogglePinAccount.mockResolvedValue(true)
    accountDataContextValue.isAccountPinned.mockReturnValue(false)
    accountDataContextValue.togglePinAccount = mockTogglePinAccount
    accountDataContextValue.isPinFeatureEnabled = false
    accountDataContextValue.loadAccountData = loadAccountDataMock
    clipboardWriteTextMock.mockResolvedValue(undefined)
    canFetchDisplayAccountInviteLinkMock.mockReturnValue(true)
    fetchDisplayAccountInviteLinkMock.mockResolvedValue(
      "https://invite.example.invalid/register?aff=row",
    )
    trackStartedMock.mockResolvedValue(undefined)
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    resolveProductAnalyticsErrorCategoryFromErrorMock.mockReturnValue(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    )
    completeProductAnalyticsActionMock.mockResolvedValue(undefined)
    resolveDisplayAccountRuntimeKeySecretMock.mockImplementation(
      async (_account: unknown, runtimeKey: unknown) => runtimeKey,
    )
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockImplementation(
      (siteType, feature) => ({
        supported: false,
        siteType,
        feature,
        reason: "feature-slice-disabled",
      }),
    )
    exportShareSnapshotWithToastMock.mockResolvedValue(undefined)
    mockHandleRefreshAccount.mockResolvedValue(undefined)
    accountActionsContextValue.refreshingAccountId = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    userPreferencesContextValue.preferences = {
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://admin.example",
        adminToken: "t",
        userId: "1",
      },
    } as Partial<UserPreferences>
    userPreferencesContextValue.showTodayCashflow = true
    hasValidManagedSiteConfigMock.mockReturnValue(true)
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockReset()
    accountActionsContextValue.refreshingAccountId = null
  })

  it("shows local menu refresh as busy and restores it after completion", async () => {
    const deferredRefresh = createDeferred<void>()
    mockHandleRefreshAccount.mockReturnValueOnce(deferredRefresh.promise)
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-local-refresh",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    await user.click(
      screen.getByRole("menuitem", { name: "account:actions.refresh" }),
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const pendingRefresh = screen.getByRole("menuitem", {
      name: "common:status.refreshing",
    })
    expect(pendingRefresh).toBeDisabled()
    expect(pendingRefresh).toHaveAttribute("aria-busy", "true")
    await user.click(pendingRefresh)
    expect(mockHandleRefreshAccount).toHaveBeenCalledTimes(1)

    deferredRefresh.resolve()

    await waitFor(() => {
      expect(
        screen.getByRole("menuitem", { name: "account:actions.refresh" }),
      ).toBeEnabled()
    })
    expect(
      screen.getByRole("menuitem", { name: "account:actions.refresh" }),
    ).not.toHaveAttribute("aria-busy")
  })

  it("copies a supported account invite link from the row menu", async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({ writeText: clipboardWriteTextMock }),
    })
    const site = buildDisplaySiteData({
      id: "invite-row",
      disabled: false,
      name: "Invite Row",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://invite.example.invalid",
    })

    render(
      <AccountActionButtons
        site={site}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    const copyInviteLinkItem = await screen.findByRole("menuitem", {
      name: "account:actions.copyInviteLink",
    })

    await user.click(copyInviteLinkItem)

    await waitFor(() => {
      expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "invite-row" }),
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      )
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        "https://invite.example.invalid/register?aff=row",
      )
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.inviteLinkCopied",
      )
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountInviteLink,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 1,
            successCount: 1,
            failureCount: 0,
          },
        },
      )
    })
  })

  it("tracks a cancelled invite-link copy without showing failure feedback", async () => {
    vi.spyOn(
      inviteLinkCopyWorkflow,
      "runInviteLinkCopyWorkflow",
    ).mockResolvedValueOnce({
      result: inviteLinkCopyWorkflow.INVITE_LINK_COPY_RESULTS.Cancelled,
      selectedCount: 1,
      itemCount: 1,
      successCount: 0,
      failureCount: 0,
      unsupportedCount: 0,
      skippedCount: 0,
    })

    await copyInviteLinkFromRowMenu("invite-cancelled")

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
      )
    })
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      analyticsErrorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
      result: inviteLinkCopyWorkflow.INVITE_LINK_COPY_RESULTS.Unsupported,
      itemCount: 0,
      failureCount: 0,
      unsupportedCount: 1,
    },
    {
      analyticsErrorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      result: inviteLinkCopyWorkflow.INVITE_LINK_COPY_RESULTS.Failure,
      itemCount: 1,
      failureCount: 1,
      unsupportedCount: 0,
    },
  ])(
    "shows failure feedback and tracks $analyticsErrorCategory for the $result invite-link result",
    async ({
      analyticsErrorCategory,
      failureCount,
      itemCount,
      result,
      unsupportedCount,
    }) => {
      vi.spyOn(
        inviteLinkCopyWorkflow,
        "runInviteLinkCopyWorkflow",
      ).mockResolvedValueOnce({
        result,
        selectedCount: 1,
        itemCount,
        successCount: 0,
        failureCount,
        unsupportedCount,
        skippedCount: 0,
      })

      await copyInviteLinkFromRowMenu(`invite-${result}`)

      await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith(
          "account:actions.copyInviteLinkFailed",
        )
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: analyticsErrorCategory },
      )
    },
  )

  it("shows fallback feedback when the invite-link workflow rejects unexpectedly", async () => {
    const workflowError = new Error("Invite-link workflow failed")
    vi.spyOn(
      inviteLinkCopyWorkflow,
      "runInviteLinkCopyWorkflow",
    ).mockRejectedValueOnce(workflowError)
    resolveProductAnalyticsErrorCategoryFromErrorMock.mockReturnValueOnce(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
    )

    await copyInviteLinkFromRowMenu("invite-workflow-rejected")

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.copyInviteLinkFailed",
      )
    })
    expect(
      resolveProductAnalyticsErrorCategoryFromErrorMock,
    ).toHaveBeenCalledWith(workflowError)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network },
    )
  })

  it("prevents rapid invite-link re-entry from leaking its loading toast", async () => {
    const deferredInviteLink = createDeferred<string>()
    fetchDisplayAccountInviteLinkMock.mockReturnValue(
      deferredInviteLink.promise,
    )
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "invite-row-rapid",
          disabled: false,
          name: "Invite Row Rapid",
          siteType: SITE_TYPES.NEW_API,
          baseUrl: "https://invite.example.invalid",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    const copyInviteLinkItem = await screen.findByRole("menuitem", {
      name: "account:actions.copyInviteLink",
    })
    toastLoadingMock
      .mockImplementationOnce(() => {
        copyInviteLinkItem.click()
        return "toast-invite-link-first"
      })
      .mockReturnValueOnce("toast-invite-link-second")

    await user.click(copyInviteLinkItem)
    deferredInviteLink.resolve(
      "https://invite.example.invalid/register?aff=rapid",
    )

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith("toast-invite-link-first")
    })
    expect(fetchDisplayAccountInviteLinkMock).toHaveBeenCalledTimes(1)
    expect(toastLoadingMock).toHaveBeenCalledTimes(1)
  })

  it("shows an unavailable invite-link action for unsupported enabled accounts", async () => {
    const user = userEvent.setup()
    canFetchDisplayAccountInviteLinkMock.mockReturnValue(false)

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "invite-unsupported",
          disabled: false,
          siteType: SITE_TYPES.ONE_API,
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const copyInviteLinkItem = await screen.findByRole("menuitem", {
      name: "account:actions.copyInviteLink",
    })
    expect(copyInviteLinkItem).toBeDisabled()
    expect(copyInviteLinkItem).toHaveAttribute(
      "title",
      "account:actions.copyInviteLinkUnsupported",
    )
  })

  it("omits the invite-link action for disabled accounts", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "invite-disabled",
          disabled: true,
          siteType: SITE_TYPES.NEW_API,
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    expect(
      screen.queryByRole("menuitem", {
        name: "account:actions.copyInviteLink",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps the fetched invite link available for manual copy when clipboard access fails", async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({ writeText: clipboardWriteTextMock }),
    })
    clipboardWriteTextMock.mockRejectedValueOnce(
      new DOMException("Clipboard access denied", "NotAllowedError"),
    )

    await copyInviteLinkFromRowMenu("invite-manual-copy", user)

    expect(
      await screen.findByRole("dialog", {
        name: "account:inviteLinkManualCopy.title",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.inviteLinkManualCopyTextarea,
      ),
    ).toHaveValue("https://invite.example.invalid/register?aff=row")
    expect(toastErrorMock).toHaveBeenCalledWith(
      "account:actions.copyInviteLinkClipboardFailed",
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
        insights: {
          itemCount: 1,
          successCount: 1,
          failureCount: 0,
        },
      },
    )

    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "account:inviteLinkManualCopy.title",
        }),
      ).not.toBeInTheDocument()
    })
  })

  it("locks externally refreshed accounts without announcing local menu work", async () => {
    accountActionsContextValue.refreshingAccountId = "acc-external-refresh"
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-external-refresh",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const refreshMenuItem = screen.getByRole("menuitem", {
      name: "account:actions.refresh",
    })
    expect(refreshMenuItem).toBeDisabled()
    expect(refreshMenuItem).not.toHaveAttribute("aria-busy")
  })

  it("tracks controlled analytics for primary account action buttons", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-single" }])
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-primary-actions",
          disabled: false,
          name: "Private Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyUrl" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:actions.edit" }),
    )

    await waitFor(() => {
      expect(trackStartedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountSiteUrl,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(trackStartedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenUpdateAccountDialog,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(trackStartedMock).not.toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccount,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
    })
  })

  it("tracks controlled analytics for account action menu entries", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-menu-actions": {
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              messageKey: "autoCheckin:providerFallback.checkinSuccessful",
            },
          },
        },
      })
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-menu-actions",
          disabled: false,
          name: "Menu Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={onDeleteAccount}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    let menu = await screen.findByRole("menu")
    expect(menu).toHaveAttribute("data-slot", "dropdown-menu-content")
    const redeemButton = (
      await within(menu).findByText("account:actions.redeemPage")
    ).closest("button")
    expect(redeemButton).not.toBeNull()
    await user.click(redeemButton!)

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    menu = await screen.findByRole("menu")
    const usageButton = (
      await within(menu).findByText("account:actions.usageLog")
    ).closest("button")
    expect(usageButton).not.toBeNull()
    await user.click(usageButton!)

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    menu = await screen.findByRole("menu")
    const quickCheckinButton = (
      await within(menu).findByText("account:actions.quickCheckin")
    ).closest("button")
    expect(quickCheckinButton).not.toBeNull()
    await user.click(quickCheckinButton!)

    await waitFor(() => {
      expect(trackStartedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenRedeemPage,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(trackStartedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAccountUsageLog,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunQuickCheckin,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
    })
  })

  it.each([
    {
      testId: ACCOUNT_MANAGEMENT_TEST_IDS.rowKeyManagementMenuItem,
      getOpenPageMock: () => openKeysPageMock,
      destination: "key management",
    },
    {
      testId: ACCOUNT_MANAGEMENT_TEST_IDS.rowModelManagementMenuItem,
      getOpenPageMock: () => openModelsPageMock,
      destination: "model management",
    },
  ])(
    "closes the account action menu before starting $destination navigation",
    async ({ testId, getOpenPageMock }) => {
      const user = userEvent.setup()
      const site = buildDisplaySiteData({
        id: "acc-in-page-navigation",
        disabled: false,
        name: "In-page Navigation Site",
      })
      let menuExpandedWhenNavigationStarted: string | null = null

      render(
        <AccountActionButtons
          site={site}
          onCopyKey={vi.fn()}
          onDeleteAccount={vi.fn()}
        />,
      )

      const moreActionsButton = screen.getByRole("button", {
        name: "common:actions.more",
      })
      const openPageMock = getOpenPageMock()
      openPageMock.mockImplementation(() => {
        menuExpandedWhenNavigationStarted =
          moreActionsButton.getAttribute("aria-expanded")
      })

      await user.click(moreActionsButton)
      const menu = await screen.findByRole("menu")
      const navigationButton = within(menu).getByTestId(testId)

      await user.click(navigationButton)

      await waitFor(() => {
        expect(openPageMock).toHaveBeenCalledWith(site.id)
      })
      expect(menuExpandedWhenNavigationStarted).toBe("false")
    },
  )

  it("does not track analytics for disabled account action menu entries", async () => {
    userPreferencesContextValue.preferences = {
      managedSiteType: SITE_TYPES.VELOERA,
      veloera: {
        baseUrl: "https://veloera-admin.example",
        adminToken: "veloera-admin-token",
        userId: "1",
      },
    } as Partial<UserPreferences>
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-disabled-menu-action",
          disabled: false,
          name: "Disabled Menu Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    expect(trackStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.LocateManagedSiteChannel,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("shows Enable and Delete actions when account is disabled", async () => {
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-1",
          disabled: true,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={onDeleteAccount}
      />,
    )

    expect(
      screen.getByRole("button", { name: "account:actions.copyUrl" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "account:actions.edit" }),
    ).toBeDisabled()

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const enableLabel = await within(menu).findByText(
      "account:actions.enableAccount",
    )
    const deleteLabel = await within(menu).findByText("account:actions.delete")
    const enableButton = enableLabel.closest("button")
    const deleteButton = deleteLabel.closest("button")
    expect(enableButton).not.toBeNull()
    expect(deleteButton).not.toBeNull()

    expect(enableButton!).toBeInTheDocument()
    expect(enableButton!).toHaveClass("text-emerald-600")
    expect(deleteButton!).toBeInTheDocument()
    expect(deleteButton!).toHaveClass("text-red-600")
    expect(
      screen.queryByRole("button", { name: "account:actions.disableAccount" }),
    ).toBeNull()
    expect(Array.from(menu.querySelectorAll("button"))).toEqual([
      enableButton!,
      deleteButton!,
    ])

    await user.click(enableButton!)
    expect(mockHandleSetAccountDisabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
      false,
    )

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const reopenedMenu = await screen.findByRole("menu")
    const reopenedDeleteLabel = await within(reopenedMenu).findByText(
      "account:actions.delete",
    )
    const reopenedDeleteButton = reopenedDeleteLabel.closest("button")
    expect(reopenedDeleteButton).not.toBeNull()

    await user.click(reopenedDeleteButton!)
    expect(onDeleteAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
    )
    expect(trackStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccount,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("shows Disable action when account is enabled", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-2",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableLabel = await within(menu).findByText(
      "account:actions.disableAccount",
    )
    const deleteLabel = await within(menu).findByText("account:actions.delete")
    const disableButton = disableLabel.closest("button")
    const deleteButton = deleteLabel.closest("button")
    expect(disableButton).not.toBeNull()
    expect(deleteButton).not.toBeNull()

    expect(disableButton!).toBeInTheDocument()
    expect(disableButton!).toHaveClass("text-amber-600")
    expect(deleteButton!).toBeInTheDocument()

    const menuButtons = Array.from(menu.querySelectorAll("button"))
    const disableIndex = menuButtons.indexOf(disableButton!)
    const deleteIndex = menuButtons.indexOf(deleteButton!)
    expect(deleteIndex - disableIndex).toBe(1)
    expect(
      screen.queryByRole("button", { name: "account:actions.enableAccount" }),
    ).toBeNull()
  })

  it("closes the menu after clicking Disable to avoid showing Enable immediately", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-3",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableLabel = await within(menu).findByText(
      "account:actions.disableAccount",
    )
    const disableButton = disableLabel.closest("button")
    expect(disableButton).not.toBeNull()

    await user.click(disableButton!)

    expect(mockHandleSetAccountDisabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-3" }),
      true,
    )

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })
  })

  it("opens CopyKeyDialog when smart copy finds zero tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-4",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-4" }),
      )
    })

    expect(toastErrorMock).not.toHaveBeenCalledWith(
      "account:actions.noKeyFound",
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      {
        insights: {
          itemCount: 0,
        },
      },
    )
  })

  it("copies a single token directly when smart copy finds exactly one key", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-single" }])

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-single-key",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "acc-single-key",
        }),
      )
      expect(toastSuccessMock).toHaveBeenCalledWith("account:actions.keyCopied")
    })
    expect(onCopyKey).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
        },
      },
    )
  })

  it("keeps the smart-copy action busy and suppresses duplicate token probes until rejection settles", async () => {
    const deferredTokens = createDeferred<Array<{ key: string }>>()
    fetchAccountTokensMock.mockReturnValueOnce(deferredTokens.promise)
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-pending-copy",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    const copyButton = screen.getByRole("button", {
      name: "account:actions.copyKey",
    })
    await user.click(copyButton)

    expect(copyButton).toHaveAttribute("aria-busy", "true")
    expect(copyButton).toBeDisabled()
    await user.click(copyButton)
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)

    deferredTokens.reject(new Error("token probe failed"))

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "account:actions.copyKey" }),
      ).toBeEnabled()
    })
    expect(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    ).not.toHaveAttribute("aria-busy")
  })

  it("shows a fetch-info error when the token probe returns a non-array payload", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce({ invalid: true } as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-non-array",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.fetchKeyInfoFailed",
      )
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })

  it("opens the copy dialog when smart copy finds multiple tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { key: "sk-one" },
      { key: "sk-two" },
    ])

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-multiple-keys",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-multiple-keys" }),
      )
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      {
        insights: {
          itemCount: 2,
        },
      },
    )
  })

  it("falls back to the copy dialog when the token probe throws", async () => {
    const tokenLoadError = { statusCode: 401, message: "private auth text" }
    fetchAccountTokensMock.mockRejectedValueOnce(tokenLoadError)
    resolveProductAnalyticsErrorCategoryFromErrorMock.mockReturnValueOnce(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
    )

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-probe-failed",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.fetchKeyListFailed",
      )
      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-probe-failed" }),
      )
    })
    expect(
      resolveProductAnalyticsErrorCategoryFromErrorMock,
    ).toHaveBeenCalledWith(tokenLoadError)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth },
    )
  })

  it("tracks completion when toggling account disabled succeeds", async () => {
    mockHandleSetAccountDisabled.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-disable-success",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableButton = (
      await within(menu).findByText("account:actions.disableAccount")
    ).closest("button")
    expect(disableButton).not.toBeNull()

    await user.click(disableButton!)

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ToggleAccountDisabled,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            targetState: PRODUCT_ANALYTICS_TARGET_STATES.Disabled,
          },
        },
      )
    })
  })

  it("tracks completion when toggling account disabled fails", async () => {
    mockHandleSetAccountDisabled.mockRejectedValueOnce(new Error("failed"))

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-disable-failure",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableButton = (
      await within(menu).findByText("account:actions.disableAccount")
    ).closest("button")
    expect(disableButton).not.toBeNull()

    await user.click(disableButton!)

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ToggleAccountDisabled,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            targetState: PRODUCT_ANALYTICS_TARGET_STATES.Disabled,
          },
        },
      )
    })
  })

  it("tracks failure when toggling account disabled is rejected by storage", async () => {
    mockHandleSetAccountDisabled.mockResolvedValueOnce(false)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-disable-storage-failure",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableButton = (
      await within(menu).findByText("account:actions.disableAccount")
    ).closest("button")
    expect(disableButton).not.toBeNull()

    await user.click(disableButton!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            targetState: PRODUCT_ANALYTICS_TARGET_STATES.Disabled,
          },
        },
      )
    })
  })

  it("tracks completion when toggling account pin succeeds", async () => {
    accountDataContextValue.isPinFeatureEnabled = true
    mockTogglePinAccount.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-pin-success",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const pinButton = (
      await within(menu).findByText("account:actions.pin")
    ).closest("button")
    expect(pinButton).not.toBeNull()

    await user.click(pinButton!)

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ToggleAccountPin,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("captures the popup source for a targeted Quick check-in request", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-5": {
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              messageKey: "autoCheckin:providerFallback.checkinSuccessful",
            },
          },
        },
      })
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-5",
          disabled: false,
          name: "Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    expect(toastLoadingMock).toHaveBeenCalledWith(
      "autoCheckin:messages.loading.running",
    )
    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
        AutoCheckinMessageTypes.RunNow,
        {
          accountIds: ["acc-5"],
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        },
      )
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
        AutoCheckinMessageTypes.GetStatus,
        undefined,
      )
      expect(toastDismissMock).toHaveBeenCalledWith("toast-quick-checkin")
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Site: autoCheckin:providerFallback.checkinSuccessful",
      )
      expect(loadAccountDataMock).toHaveBeenCalled()
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunQuickCheckin,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
          },
        },
      )
    })
    expect(getCurrentTempWindowRequestSourceMock).toHaveBeenCalledTimes(1)
    expect(
      sendRuntimeMessageMock.mock.calls.filter(
        ([type]) => type === AutoCheckinMessageTypes.RunNow,
      ),
    ).toHaveLength(1)
    expect(
      sendRuntimeMessageMock.mock.calls.filter(
        ([type]) => type === AutoCheckinMessageTypes.GetStatus,
      ),
    ).toHaveLength(1)
  })

  it("shows a failure toast when quick check-in finishes without a per-account result", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-fallback")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, data: { perAccount: {} } })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-fallback",
          disabled: false,
          name: "Fallback Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith(
        "toast-quick-checkin-fallback",
      )
      expect(toastErrorMock).toHaveBeenCalledWith(
        "autoCheckin:messages.error.runFailed",
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        },
      )
    })
  })

  it("shows a failure toast when quick check-in status lookup fails", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-status-failed")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "status unavailable" })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-status-failed",
          disabled: false,
          name: "Status Failed Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith(
        "toast-quick-checkin-status-failed",
      )
      expect(toastErrorMock).toHaveBeenCalledWith(
        "autoCheckin:messages.error.runFailed",
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        },
      )
    })
  })

  it("shows a quick-checkin failure toast when the background run fails", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-error")
    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: false,
      error: "background failed",
    })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-failed",
          disabled: false,
          name: "Failed Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith("toast-quick-checkin-error")
      expect(toastErrorMock).toHaveBeenCalledWith(
        "autoCheckin:messages.error.runFailed",
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("tracks quick-checkin failure analytics when the run request throws", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-throw")
    sendRuntimeMessageMock.mockRejectedValueOnce(
      new Error("background blew up"),
    )

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-throw",
          disabled: false,
          name: "Thrown Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith("toast-quick-checkin-throw")
      expect(toastErrorMock).toHaveBeenCalledWith(
        "autoCheckin:messages.error.runFailed",
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
    expect(loadAccountDataMock).not.toHaveBeenCalled()
  })

  it("tracks quick-checkin runtime failures with the shared safe error category", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-structured-error")
    const structuredError = { statusCode: 403, message: "private auth text" }
    sendRuntimeMessageMock.mockRejectedValueOnce(structuredError)
    resolveProductAnalyticsErrorCategoryFromErrorMock.mockReturnValueOnce(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
    )

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-structured-error",
          disabled: false,
          name: "Structured Error Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(
        resolveProductAnalyticsErrorCategoryFromErrorMock,
      ).toHaveBeenCalledWith(structuredError)
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth },
      )
    })
    expect(loadAccountDataMock).not.toHaveBeenCalled()
  })

  it("tracks skipped quick-checkin completion when the account result is skipped", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-skipped")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-quick-skipped": {
              status: CHECKIN_RESULT_STATUS.SKIPPED,
              messageKey: "autoCheckin:providerFallback.checkinSkipped",
            },
          },
        },
      })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-skipped",
          disabled: false,
          name: "Skipped Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        {
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Warning,
          },
        },
      )
    })
  })

  it("tracks failed quick-checkin completion with status kind context", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-failed-status")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-quick-failed-status": {
              status: CHECKIN_RESULT_STATUS.FAILED,
              messageKey: "autoCheckin:providerFallback.checkinFailed",
            },
          },
        },
      })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-failed-status",
          disabled: false,
          name: "Failed Status Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        },
      )
    })
  })

  it("tracks unsupported quick-checkin endpoint failures with a safe category", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-unsupported")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-quick-unsupported": {
              status: CHECKIN_RESULT_STATUS.FAILED,
              messageKey: "autoCheckin:providerFallback.endpointNotSupported",
            },
          },
        },
      })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-unsupported",
          disabled: false,
          name: "Unsupported Site",
          checkIn: { enableDetection: true },
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        },
      )
    })
  })

  it("shows a pin toggle when the feature is enabled and confirms successful pinning", async () => {
    accountDataContextValue.isPinFeatureEnabled = true
    accountDataContextValue.isAccountPinned.mockReturnValue(false)
    mockTogglePinAccount.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-pin",
          disabled: false,
          name: "Pinned Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.pin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(mockTogglePinAccount).toHaveBeenCalledWith("acc-pin")
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "messages:toast.success.accountPinned",
      )
    })
  })

  it("tracks an unknown failure when pinning does not change state", async () => {
    accountDataContextValue.isPinFeatureEnabled = true
    accountDataContextValue.isAccountPinned.mockReturnValue(false)
    mockTogglePinAccount.mockResolvedValueOnce(false)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-pin-false",
          disabled: false,
          name: "Pin Failure Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.pin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(mockTogglePinAccount).toHaveBeenCalledWith("acc-pin-false")
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalledWith(
      "messages:toast.success.accountPinned",
    )
  })

  it("shares a sanitized snapshot using only visible cashflow data", async () => {
    userPreferencesContextValue.showTodayCashflow = false
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-share",
          disabled: false,
          name: "Share Site",
          baseUrl: "https://api.example.com/v1/chat/completions",
          balance: { USD: 12, CNY: 0 },
          todayIncome: { USD: 8, CNY: 0 },
          todayConsumption: { USD: 4, CNY: 0 },
          last_sync_time: 0,
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "shareSnapshots:actions.shareAccountSnapshot",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(exportShareSnapshotWithToastMock).toHaveBeenCalledTimes(1)
    })

    const payload = exportShareSnapshotWithToastMock.mock.calls[0]?.[0]?.payload
    expect(payload).toEqual(
      expect.objectContaining({
        siteName: "Share Site",
        originUrl: "https://api.example.com",
        currencyType: "USD",
        balance: 12,
      }),
    )
    expect(payload).not.toHaveProperty("todayIncome")
    expect(payload).not.toHaveProperty("todayOutcome")
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ShareSnapshots,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShareAccountSnapshot,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ShareSnapshots,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShareAccountSnapshot,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("includes the full cashflow bundle when the preference and both metrics are complete", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-share-complete",
          disabled: false,
          todayIncome: { USD: 8, CNY: 0 },
          todayConsumption: { USD: 4, CNY: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    const menu = await screen.findByRole("menu")
    await user.click(
      within(menu)
        .getByText("shareSnapshots:actions.shareAccountSnapshot")
        .closest("button")!,
    )

    await waitFor(() => {
      expect(exportShareSnapshotWithToastMock).toHaveBeenCalledTimes(1)
    })
    expect(
      exportShareSnapshotWithToastMock.mock.calls[0]?.[0]?.payload,
    ).toEqual(
      expect.objectContaining({
        todayIncome: 8,
        todayOutcome: 4,
        todayNet: 4,
      }),
    )
  })

  it.each([
    {
      label: "partial consumption",
      availability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
        },
      }),
    },
    {
      label: "unavailable income",
      availability: buildCompleteTodayStatsAvailability({
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      }),
    },
  ])(
    "falls back to a balance-only snapshot for $label",
    async ({ availability }) => {
      const user = userEvent.setup()

      render(
        <AccountActionButtons
          site={buildDisplaySiteData({
            id: "acc-share-incomplete",
            disabled: false,
            todayIncome: { USD: 8, CNY: 0 },
            todayConsumption: { USD: 4, CNY: 0 },
            todayStatsAvailability: availability,
          })}
          onCopyKey={vi.fn()}
          onDeleteAccount={vi.fn()}
        />,
      )

      await user.click(
        screen.getByRole("button", { name: "common:actions.more" }),
      )
      const menu = await screen.findByRole("menu")
      await user.click(
        within(menu)
          .getByText("shareSnapshots:actions.shareAccountSnapshot")
          .closest("button")!,
      )

      await waitFor(() => {
        expect(exportShareSnapshotWithToastMock).toHaveBeenCalledTimes(1)
      })
      const payload =
        exportShareSnapshotWithToastMock.mock.calls[0]?.[0]?.payload
      expect(payload).not.toHaveProperty("todayIncome")
      expect(payload).not.toHaveProperty("todayOutcome")
      expect(payload).not.toHaveProperty("todayNet")
    },
  )

  it("tracks share snapshot failures with an unknown error category", async () => {
    exportShareSnapshotWithToastMock.mockRejectedValueOnce(
      new Error("export failed"),
    )
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-share-failure",
          disabled: false,
          name: "Share Failure Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "shareSnapshots:actions.shareAccountSnapshot",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("navigates to managed site channels focused by channelId when an exact match is found", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-1",
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 123,
            name: "Managed Channel 123",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "sk-1",
          },
        ],
        total: 1,
        type_counts: {},
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsForChannelMock).toHaveBeenCalledWith(123)
    })
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
  })

  it("uses legacy channel search for account shortcut locate when token status resources are not feature-gated", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-legacy" }])

    const staleResourceSearch = vi
      .fn()
      .mockRejectedValue(new Error("stale duplicate-matching resource path"))
    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-legacy",
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 321,
            name: "Legacy Managed Channel",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "sk-legacy",
          },
        ],
        total: 1,
        type_counts: {},
      }),
      searchResourceDuplicateChannels: staleResourceSearch,
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6-legacy",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsForChannelMock).toHaveBeenCalledWith(321)
    })
    expect(staleResourceSearch).not.toHaveBeenCalled()
    expect(managedService.searchChannel).toHaveBeenCalledWith(
      expect.any(Object),
      "https://api.example.com",
    )
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
  })

  it("uses resource-backed channel candidates for account shortcut locate when feature-gated", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-resource" }])

    const resourceSummary = buildResourceSummary({
      id: 654,
      name: "Resource Managed Channel",
      baseUrl: "https://api.example.com",
      models: ["gpt-4"],
    })
    const resources: ManagedUpstreamResourcesCapability = {
      items: {
        list: vi.fn(),
        search: vi.fn().mockResolvedValue({
          items: [resourceSummary],
          total: 1,
        }),
        getDetail: vi.fn().mockResolvedValue({
          summary: resourceSummary,
          native: {
            id: 654,
            name: "Resource Managed Channel",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "sk-resource",
          },
        }),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      drafts: {
        prepareImportDraft: vi.fn(),
        prepareEditDraft: vi.fn(),
        describeFields: vi.fn(),
        validateDraft: vi.fn(),
      },
    }
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockReturnValue({
      supported: true,
      siteType: SITE_TYPES.NEW_API,
      feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenChannelStatus,
      capabilities: resources,
    })
    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-resource",
      }),
      searchChannel: vi
        .fn()
        .mockRejectedValue(new Error("legacy search should not run")),
      searchResourceDuplicateChannels: vi
        .fn()
        .mockRejectedValue(new Error("stale duplicate-matching resource path")),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6-resource",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsForChannelMock).toHaveBeenCalledWith(654)
    })
    expect(
      managedService.searchResourceDuplicateChannels,
    ).not.toHaveBeenCalled()
    expect(managedService.searchChannel).not.toHaveBeenCalled()
    expect(resources.items.search).toHaveBeenCalledWith(
      expect.any(Object),
      "https://api.example.com",
    )
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
  })

  it("uses a secondary exact-model explanation when the account key is blank", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "",
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 456,
            name: "Managed Channel 456",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6b",
          disabled: false,
          name: "Site",
          baseUrl: "  https://api.example.com/v1/openai  ",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateSecondaryExactModels",
      )
    })

    expect(fetchAccountTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.example.com/v1/openai",
      }),
    )
    expect(resolveDisplayAccountRuntimeKeySecretMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.example.com/v1/openai",
      }),
      expect.objectContaining({
        secret: "",
        token: expect.objectContaining({ key: "" }),
      }),
    )
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
  })

  it("falls back to a fuzzy URL-only explanation when no secondary match exists", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-1",
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 456,
            name: "Managed Channel 456",
            base_url: "https://api.example.com",
            models: "claude-3",
            key: "",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateFuzzyUrlOnly",
      )
    })
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
  })

  it("shows a no-key fallback when the account has no API tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn(),
      searchChannel: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastCustomMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 5000,
        }),
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("falls back to base URL search when multiple keys are present", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { key: "sk-1" },
      { key: "sk-2" },
    ])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-8",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastCustomMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 5000,
        }),
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("shows an actionable locate action for providers with reliable base-url lookup", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-8b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()
    expect(button!).toBeEnabled()
    expect(
      within(menu).queryByText(
        "account:actions.locateManagedSiteChannelUnsupportedHint",
      ),
    ).toBeNull()
  })

  it.each([
    [
      "Veloera",
      {
        managedSiteType: SITE_TYPES.VELOERA,
        veloera: {
          baseUrl: "https://veloera-admin.example",
          adminToken: "veloera-admin-token",
          userId: "1",
        },
      },
      "Veloera Site",
    ],
  ])(
    "shows a disabled locate action with visible unsupported guidance for %s",
    async (_label, preferences, siteName) => {
      userPreferencesContextValue.preferences =
        preferences as Partial<UserPreferences>

      const user = userEvent.setup()

      render(
        <AccountActionButtons
          site={buildDisplaySiteData({
            id: "acc-8c",
            disabled: false,
            name: siteName,
            baseUrl: "https://api.example.com/v1/",
          })}
          onCopyKey={vi.fn()}
          onDeleteAccount={vi.fn()}
        />,
      )

      await user.click(
        screen.getByRole("button", { name: "common:actions.more" }),
      )

      const menu = await screen.findByRole("menu")
      const label = await within(menu).findByText(
        "account:actions.locateManagedSiteChannel",
      )
      const button = label.closest("button")
      expect(button).not.toBeNull()
      expect(button!).toBeDisabled()
      const hint = within(menu).getByText(
        "account:actions.locateManagedSiteChannelUnsupportedHint",
      )
      expect(hint).toBeInTheDocument()
      const description = within(menu).getByText(
        "account:actions.locateManagedSiteChannelUnsupported",
      )
      expect(button!).toHaveAttribute(
        "title",
        "account:actions.locateManagedSiteChannelUnsupported",
      )
      expect(button!).toHaveAttribute("aria-describedby", description.id)

      await user.click(button!)

      expect(getManagedSiteServiceMock).not.toHaveBeenCalled()
      expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
    },
  )

  it("shows an actionable locate action for Claude Code Hub", async () => {
    userPreferencesContextValue.preferences = {
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      claudeCodeHub: {
        baseUrl: "https://cch-admin.example",
        adminToken: "cch-admin-token",
      },
    } as Partial<UserPreferences>

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-8d",
          disabled: false,
          name: "Claude Code Hub Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()
    expect(button!).toBeEnabled()
    expect(
      within(menu).queryByText(
        "account:actions.locateManagedSiteChannelUnsupportedHint",
      ),
    ).toBeNull()
  })

  it("hides the locate action when managed site config is missing", async () => {
    hasValidManagedSiteConfigMock.mockReturnValue(false)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-9",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = within(menu).queryByText(
      "account:actions.locateManagedSiteChannel",
    )
    expect(label).toBeNull()
    expect(hasValidManagedSiteConfigMock).toHaveBeenCalledWith(
      userPreferencesContextValue.preferences,
    )
    expect(getManagedSiteServiceMock).not.toHaveBeenCalled()
  })

  it("shows the account-specific config-missing fallback when admin config disappears at click-time", async () => {
    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue(null),
      prepareChannelFormData: vi.fn(),
      searchChannel: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-9b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastCustomMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 5000,
        }),
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("falls back to base URL search when token response is not an array", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce({} as any)

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-10",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.channelLocateFailed",
      )
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
    })
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })
})

const buildResourceSummary = ({
  id,
  name,
  baseUrl,
  models,
}: {
  id: number
  name: string
  baseUrl: string
  models: string[]
}): ManagedUpstreamResourceSummary => ({
  ref: {
    managedSiteType: SITE_TYPES.NEW_API,
    scopeKey: "https://admin.example",
    resourceId: String(id),
  },
  displayName: name,
  nativeKind: MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS.Channel,
  status: MANAGED_UPSTREAM_RESOURCE_STATUSES.Enabled,
  endpointLabel: baseUrl,
  modelPreview: models,
  secretState: MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Available,
  capabilities: {},
})
