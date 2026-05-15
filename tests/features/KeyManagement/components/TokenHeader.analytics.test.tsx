import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TokenHeader } from "~/features/KeyManagement/components/TokenListItem/TokenHeader"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
} from "~/services/managedSites/tokenChannelStatus"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { render, screen, waitFor } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

const {
  completeProductAnalyticsActionMock,
  createProfileMock,
  openInCherryStudioMock,
  openWithAccountMock,
  resolveDisplayAccountTokenForSecretMock,
  showResultToastMock,
  startProductAnalyticsActionMock,
} = vi.hoisted(() => ({
  completeProductAnalyticsActionMock: vi.fn(),
  createProfileMock: vi.fn(),
  openInCherryStudioMock: vi.fn(),
  openWithAccountMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
  showResultToastMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({ openWithAccount: openWithAccountMock }),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    claudeCodeRouterApiKey: "",
    claudeCodeRouterBaseUrl: "",
    cliProxyBaseUrl: "",
    cliProxyManagementKey: "",
    managedSiteType: "new-api",
  }),
}))

vi.mock("~/components/KiloCodeExportDialog", () => ({
  KiloCodeExportDialog: () => null,
}))

vi.mock("~/components/ClaudeCodeRouterImportDialog", () => ({
  ClaudeCodeRouterImportDialog: () => null,
}))

vi.mock("~/components/CliProxyExportDialog", () => ({
  CliProxyExportDialog: () => null,
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  resolveDisplayAccountTokenForSecret: (...args: unknown[]) =>
    resolveDisplayAccountTokenForSecretMock(...args),
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      createProfile: (...args: unknown[]) => createProfileMock(...args),
    },
  }),
)

vi.mock("~/services/integrations/cherryStudio", () => ({
  OpenInCherryStudio: (...args: unknown[]) => openInCherryStudioMock(...args),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: (...args: unknown[]) => showResultToastMock(...args),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function renderTokenHeader(
  props: Partial<Parameters<typeof TokenHeader>[0]> = {},
) {
  const account = createAccount({
    id: "acc-1",
    name: "Account 1",
    token: "account-access-token",
    baseUrl: "https://account.example/v1",
  })
  const token = createToken({
    id: 1,
    name: "Token 1",
    key: "sk-sensitive-original",
    accountId: "acc-1",
    accountName: "Account 1",
  })

  return render(
    <TokenHeader
      token={token}
      copyKey={vi.fn()}
      handleEditToken={vi.fn()}
      handleDeleteToken={vi.fn()}
      account={account}
      {...props}
    />,
    {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    },
  )
}

describe("TokenHeader analytics", () => {
  beforeEach(() => {
    completeProductAnalyticsActionMock.mockReset()
    createProfileMock.mockReset()
    openInCherryStudioMock.mockReset()
    openWithAccountMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockReset()
    showResultToastMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("tracks saving a token to API Credential Profiles as sanitized success after profile creation", async () => {
    const resolvedSecret = "sk-sensitive-resolved"
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ id: 1, key: resolvedSecret }),
    )
    createProfileMock.mockResolvedValueOnce({
      id: "profile-sensitive-id",
      name: "Sensitive Profile Name",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://account.example/v1",
      apiKey: resolvedSecret,
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.saveToApiProfiles",
      }),
    )

    await waitFor(() => {
      expect(createProfileMock).toHaveBeenCalledTimes(1)
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
    expect(
      JSON.stringify(startProductAnalyticsActionMock.mock.calls),
    ).not.toContain("sk-sensitive")
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("Sensitive Profile Name")
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain(resolvedSecret)
  })

  it("tracks saving a token to API Credential Profiles as sanitized unknown failure when secret resolution fails", async () => {
    resolveDisplayAccountTokenForSecretMock.mockRejectedValueOnce(
      new Error("secret resolution exposed sk-sensitive-resolved"),
    )

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.saveToApiProfiles",
      }),
    )

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
    expect(createProfileMock).not.toHaveBeenCalled()
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("sk-sensitive")
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("secret resolution exposed")
  })

  it("tracks managed-site token verification retry as sanitized success after callback completion", async () => {
    const onManagedSiteVerificationRetry = vi
      .fn()
      .mockResolvedValueOnce(undefined)

    const user = userEvent.setup()
    renderTokenHeader({
      onManagedSiteVerificationRetry,
      managedSiteStatus: {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
        recovery: {
          siteType: "new-api",
          managedBaseUrl: "https://managed-sensitive.example",
          searchBaseUrl: "https://account-sensitive.example",
          loginCredentialsConfigured: true,
          authenticatedBrowserSessionExists: false,
          automaticCodeConfigured: true,
        },
      },
    })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:managedSiteStatus.actions.verifyNow",
      }),
    )

    await waitFor(() => {
      expect(onManagedSiteVerificationRetry).toHaveBeenCalledTimes(1)
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.RetryManagedSiteTokenVerification,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("managed-sensitive")
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("account-sensitive")
  })

  it("tracks managed-site token verification retry as sanitized unknown failure when callback rejects", async () => {
    const onManagedSiteVerificationRetry = vi
      .fn()
      .mockRejectedValueOnce(new Error("retry exposed sk-sensitive-retry"))

    const user = userEvent.setup()
    renderTokenHeader({
      onManagedSiteVerificationRetry,
      managedSiteStatus: {
        status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
        reason:
          MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE,
        recovery: {
          siteType: "new-api",
          managedBaseUrl: "https://managed-sensitive.example",
          searchBaseUrl: "https://account-sensitive.example",
          loginCredentialsConfigured: false,
          authenticatedBrowserSessionExists: true,
          automaticCodeConfigured: false,
        },
      },
    })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:managedSiteStatus.actions.verifyNow",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("sk-sensitive-retry")
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("managed-sensitive")
  })

  it("tracks Cherry Studio export success after opening", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ id: 1, key: "sk-resolved" }),
    )

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.useInCherry",
      }),
    )

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToCherryStudio,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.AccountTokenThirdPartyExportDialog,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(openInCherryStudioMock).toHaveBeenCalledTimes(1)
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("tracks Cherry Studio export as unknown failure when opening throws", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ id: 1, key: "sk-resolved" }),
    )
    openInCherryStudioMock.mockImplementationOnce(() => {
      throw new Error("open failed")
    })

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.useInCherry",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("tracks managed-site single token import as success when the dialog opens", async () => {
    openWithAccountMock.mockResolvedValueOnce({ opened: true })

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    )

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.AccountTokenThirdPartyExportDialog,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("tracks managed-site single token import as skipped when preparation does not open", async () => {
    openWithAccountMock.mockResolvedValueOnce({ opened: false })

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("tracks managed-site single token import as failure and shows fallback toast when preparation rejects", async () => {
    openWithAccountMock.mockRejectedValueOnce(new Error("prepare failed"))

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
      expect(showResultToastMock).toHaveBeenCalledWith({
        success: false,
        message: "messages:errors.operation.failed",
      })
    })
  })
})
