import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "~/constants/siteType"
import { TokenHeader } from "~/features/KeyManagement/components/TokenListItem/TokenHeader"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
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
  verifyCliDialogRenderMock,
  verifyDialogRenderMock,
} = vi.hoisted(() => ({
  completeProductAnalyticsActionMock: vi.fn(),
  createProfileMock: vi.fn(),
  openInCherryStudioMock: vi.fn(),
  openWithAccountMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
  showResultToastMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  verifyCliDialogRenderMock: vi.fn(),
  verifyDialogRenderMock: vi.fn(),
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

vi.mock("~/components/dialogs/VerifyCliSupportDialog", () => ({
  VerifyCliSupportDialog: (props: unknown) => {
    verifyCliDialogRenderMock(props)
    return null
  },
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog",
  () => ({
    VerifyApiCredentialProfileDialog: (props: unknown) => {
      verifyDialogRenderMock(props)
      return null
    },
  }),
)

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
    verifyCliDialogRenderMock.mockReset()
    verifyDialogRenderMock.mockReset()
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

  it("tracks opening token API verification without exposing the resolved secret", async () => {
    const resolvedSecret = "sk-sensitive-verify"
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ id: 1, key: resolvedSecret }),
    )

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.verifyApi",
      }),
    )

    await waitFor(() => {
      expect(resolveDisplayAccountTokenForSecretMock).toHaveBeenCalledTimes(1)
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyAccountTokenApi,
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
    ).not.toContain(resolvedSecret)
  })

  it("opens token API verification with a transient normalized profile", async () => {
    const resolvedSecret = "sk-aihubmix-resolved"
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ id: 8, key: resolvedSecret }),
    )

    const user = userEvent.setup()
    renderTokenHeader({
      account: createAccount({
        id: "aihubmix-account",
        name: "AIHubMix Account",
        siteType: SITE_TYPES.AIHUBMIX,
        baseUrl: AIHUBMIX_WEB_ORIGIN,
        tagIds: ["tag-a"],
      }),
      token: createToken({
        id: 8,
        name: "Model Key",
        accountId: "aihubmix-account",
        accountName: "AIHubMix Account",
        key: "masked-key",
      }),
    })

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton),
    )

    await waitFor(() => {
      expect(verifyDialogRenderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          profile: expect.objectContaining({
            id: "account-token:aihubmix-account:8",
            name: "AIHubMix Account - Model Key",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: AIHUBMIX_API_ORIGIN,
            apiKey: resolvedSecret,
            tagIds: ["tag-a"],
            notes: "",
          }),
        }),
      )
    })
  })

  it("tracks token API verification open as sanitized unknown failure when secret resolution fails", async () => {
    resolveDisplayAccountTokenForSecretMock.mockRejectedValueOnce(
      new Error("verification exposed sk-sensitive-verify"),
    )

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.verifyApi",
      }),
    )

    await waitFor(() => {
      expect(verifyDialogRenderMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
        }),
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
      expect(showResultToastMock).toHaveBeenCalledWith({
        success: false,
        message: "messages:errors.operation.failed",
      })
    })
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("sk-sensitive")
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("verification exposed")
  })

  it("opens token CLI support verification with a transient normalized profile", async () => {
    const resolvedSecret = "sk-cli-resolved"
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ id: 9, key: resolvedSecret }),
    )

    const user = userEvent.setup()
    renderTokenHeader({
      account: createAccount({
        id: "cli-account",
        name: "CLI Account",
        baseUrl: "https://cli.example/v1",
        tagIds: ["tag-cli"],
      }),
      token: createToken({
        id: 9,
        name: "CLI Key",
        accountId: "cli-account",
        accountName: "CLI Account",
        key: "masked-key",
      }),
    })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.verifyCliSupport",
      }),
    )

    await waitFor(() => {
      expect(verifyCliDialogRenderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          profile: expect.objectContaining({
            id: "account-token:cli-account:9",
            name: "CLI Account - CLI Key",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://cli.example/v1",
            apiKey: resolvedSecret,
            tagIds: ["tag-cli"],
            notes: "",
          }),
        }),
      )
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyAccountTokenCliSupport,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain(resolvedSecret)
  })

  it("tracks token CLI support verification open as sanitized unknown failure when secret resolution fails", async () => {
    resolveDisplayAccountTokenForSecretMock.mockRejectedValueOnce(
      new Error("cli verification exposed sk-sensitive-cli"),
    )

    const user = userEvent.setup()
    renderTokenHeader()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.verifyCliSupport",
      }),
    )

    await waitFor(() => {
      expect(verifyCliDialogRenderMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
        }),
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
      expect(showResultToastMock).toHaveBeenCalledWith({
        success: false,
        message: "messages:errors.operation.failed",
      })
    })
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("sk-sensitive-cli")
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain("cli verification exposed")
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

describe("TokenHeader responsive layout", () => {
  it("lets token text take full width before actions on narrow screens", async () => {
    renderTokenHeader({
      token: createToken({
        id: 1,
        name: "Readable Key Card Name",
        accountName: "Long Account Name",
      }),
    })

    const title = await screen.findByRole("heading", {
      name: "Readable Key Card Name",
    })
    const contentColumn = title.closest("div")?.parentElement
    const header = contentColumn?.parentElement
    const actions = screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.tokenRowActions)

    expect(header).toHaveClass("flex-col", "sm:flex-row", "sm:items-start")
    expect(contentColumn).toHaveClass("w-full", "sm:w-auto")
    expect(actions).toHaveClass(
      "w-full",
      "flex-wrap",
      "justify-start",
      "sm:w-auto",
      "sm:justify-end",
    )
  })
})
