import "./copyKeyDialogMocks"

import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

import {
  captureApiCredentialProfileMock,
  ccSwitchDialogMock,
  claudeCodeRouterDialogMock,
  cliProxyDialogMock,
  completeProductAnalyticsActionMock,
  createApiCredentialProfileMock,
  createApiTokenMock,
  fetchAccountAvailableModelsMock,
  fetchAccountTokensMock,
  fetchUserGroupsMock,
  kelivoExportDialogMock,
  kiloCodeExportDialogMock,
  kiloCodeProfileExportDialogMock,
  loggerErrorMock,
  openInCherryStudioMock,
  openWithAccountMock,
  openWithCredentialsMock,
  resolveApiTokenKeyMock,
  startProductAnalyticsActionMock,
  toastErrorMock,
  toastSuccessMock,
  userPreferencesContextMock,
} from "./copyKeyDialogMocks"
import {
  ACCOUNT,
  AIHUBMIX_ACCOUNT,
  renderExpandedServiceCredentialDialog,
  selectExportAction,
  setupCopyKeyDialogTestDefaults,
  TOKEN,
} from "./copyKeyDialogTestSupport"

async function renderExpandedDetails() {
  const user = userEvent.setup()

  render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

  await user.click(
    await screen.findByRole("button", {
      name: "keyManagement:actions.detailsFor",
    }),
  )

  return user
}

describe("CopyKeyDialog exports and service credentials", () => {
  beforeEach(() => {
    setupCopyKeyDialogTestDefaults()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("copies the resolved full key when inventory is masked", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-abcd************wxyz",
      },
    ])
    resolveApiTokenKeyMock.mockResolvedValueOnce("sk-full-secret")

    const user = await renderExpandedDetails()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    await waitFor(() => {
      expect(resolveApiTokenKeyMock).toHaveBeenCalled()
      expect(writeText).toHaveBeenCalledWith("sk-full-secret")
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("tracks Cherry Studio export for a copied account token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    resolveApiTokenKeyMock.mockResolvedValueOnce("sk-full-secret")

    const user = await renderExpandedDetails()

    await selectExportAction(user, "keyManagement:actions.useInCherry")

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToCherryStudio,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(openInCherryStudioMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
        expect.objectContaining({ key: "sk-full-secret" }),
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("opens an editable Kelivo export dialog for an account token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    resolveApiTokenKeyMock.mockResolvedValueOnce("sk-full-secret")
    const user = await renderExpandedDetails()

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    await waitFor(() => {
      expect(kelivoExportDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          initialValue: {
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            name: "Example - default",
            baseUrl: "https://example.com",
            apiKey: "sk-full-secret",
          },
        }),
      )
    })
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()
  })

  it("reports Cherry Studio export failures without leaving the action pending", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    openInCherryStudioMock.mockImplementationOnce(() => {
      throw new Error("Cherry Studio is unavailable")
    })
    const user = await renderExpandedDetails()

    await selectExportAction(user, "keyManagement:actions.useInCherry")

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.operation.failed",
      )
    })
  })

  it("tracks managed-site single token import when the copied token flow opens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    openWithAccountMock.mockImplementationOnce(
      async (_account, _token, onResult) => {
        onResult({ success: false, message: "managed import failed" })
        return { opened: true }
      },
    )

    const user = await renderExpandedDetails()

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(openWithAccountMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
        expect.objectContaining({ id: 1 }),
        expect.any(Function),
      )
      expect(toastErrorMock).toHaveBeenCalledWith("managed import failed")
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("tracks managed-site import failure when opening the flow rejects", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    openWithAccountMock.mockRejectedValueOnce(
      new Error("managed import unavailable"),
    )

    const user = await renderExpandedDetails()

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.operation.failed",
      )
    })
  })

  it("marks successful managed-site onboarding even when no flow opens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    userPreferencesContextMock.markGatewayGuidanceOnboardingCompleted.mockReset()
    openWithAccountMock.mockImplementationOnce(
      async (_account, _token, onResult) => {
        onResult({ success: true })
        return { opened: false, deferred: false }
      },
    )
    const user = await renderExpandedDetails()

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

    await waitFor(() => {
      expect(
        userPreferencesContextMock.markGatewayGuidanceOnboardingCompleted,
      ).toHaveBeenCalledTimes(1)
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
      )
    })
  })

  it("handles rejected guidance writes after a successful managed-site import", async () => {
    const guidanceWriteError = new Error("guidance storage unavailable")
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    userPreferencesContextMock.markGatewayGuidanceOnboardingCompleted.mockRejectedValueOnce(
      guidanceWriteError,
    )
    openWithAccountMock.mockImplementationOnce(
      async (_account, _token, onResult) => {
        onResult({ success: true })
        return { opened: false, deferred: false }
      },
    )
    const user = await renderExpandedDetails()

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

    await waitFor(() => {
      expect(loggerErrorMock).toHaveBeenCalledWith(
        "Failed to mark gateway guidance onboarding complete",
        guidanceWriteError,
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
      )
    })
  })

  it("explains missing external-tool configuration before opening imports", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    userPreferencesContextMock.cliProxyBaseUrl = ""
    userPreferencesContextMock.cliProxyManagementKey = ""
    userPreferencesContextMock.claudeCodeRouterBaseUrl = ""
    const user = await renderExpandedDetails()

    await selectExportAction(user, "keyManagement:actions.importToCliProxy")
    await selectExportAction(
      user,
      "keyManagement:actions.importToClaudeCodeRouter",
    )

    expect(toastErrorMock).toHaveBeenCalledWith(
      "messages:cliproxy.configMissing",
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "messages:claudeCodeRouter.configMissing",
    )
    expect(cliProxyDialogMock).not.toHaveBeenCalled()
    expect(claudeCodeRouterDialogMock).not.toHaveBeenCalled()
  })

  it("resets copied state after showing the copied action label", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    // Fake timers must be active before the copy click so the dialog's 2s
    // reset timeout is created as a fake timer we can advance deterministically.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    })
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.copied",
      }),
    ).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith("sk-test")

    // The dialog resets its copied label via a 2s timeout; advance fake
    // timers instead of waiting on real time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(
      screen.queryByRole("button", {
        name: "ui:dialog.copyKey.copied",
      }),
    ).not.toBeInTheDocument()
  })

  it("renders service credential details without token-only quota or expiry metadata", async () => {
    await renderExpandedServiceCredentialDialog()

    expect(
      screen.getByRole("button", { name: "ui:dialog.copyKey.copy" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "common:actions.export" }),
    ).toBeInTheDocument()
    expect(screen.getByText("sk-servi****************cret")).toBeInTheDocument()
    expect(
      screen.queryByText("sk-service-credential-secret"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("ui:dialog.copyKey.expireTime"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("ui:dialog.copyKey.usedQuota"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("ui:dialog.copyKey.remainingQuota"),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("-1")).not.toBeInTheDocument()
  })

  it("exports service credentials with the credential API base URL", async () => {
    openWithCredentialsMock.mockImplementationOnce(
      async (_credential, onResult) => {
        onResult({ success: true, message: "credential import queued" })
        return { deferred: true }
      },
    )
    const user = await renderExpandedServiceCredentialDialog()

    await selectExportAction(user, "keyManagement:actions.useInCherry")

    await waitFor(() => {
      expect(openInCherryStudioMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://api.example.invalid/v1",
          name: "SharedChat - Codex service key",
        }),
        expect.objectContaining({
          key: "sk-service-credential-secret",
          name: "SharedChat - Codex service key",
        }),
      )
    })

    await selectExportAction(user, "keyManagement:actions.exportToCCSwitch")
    await waitFor(() => {
      expect(ccSwitchDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({
            baseUrl: "https://api.example.invalid/v1",
          }),
          token: expect.objectContaining({
            key: "sk-service-credential-secret",
          }),
        }),
      )
    })

    await selectExportAction(user, "keyManagement:actions.importToCliProxy")
    await waitFor(() => {
      expect(cliProxyDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({
            baseUrl: "https://api.example.invalid/v1",
          }),
          token: expect.objectContaining({
            key: "sk-service-credential-secret",
          }),
          apiTypeHint: API_TYPES.OPENAI_COMPATIBLE,
        }),
      )
    })
    act(() => {
      cliProxyDialogMock.mock.calls[0]?.[0].onClose()
    })

    await selectExportAction(
      user,
      "keyManagement:actions.importToClaudeCodeRouter",
    )
    await waitFor(() => {
      expect(claudeCodeRouterDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account: expect.objectContaining({
            baseUrl: "https://api.example.invalid/v1",
          }),
          token: expect.objectContaining({
            key: "sk-service-credential-secret",
          }),
          routerApiKey: "ccr-management-key",
          routerBaseUrl: "https://router.example.invalid",
        }),
      )
    })
    act(() => {
      claudeCodeRouterDialogMock.mock.calls[0]?.[0].onClose()
    })

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")
    await waitFor(() => {
      expect(openWithCredentialsMock).toHaveBeenCalledWith(
        {
          name: "SharedChat - Codex service key",
          baseUrl: "https://api.example.invalid/v1",
          apiKey: "sk-service-credential-secret",
        },
        expect.any(Function),
        {
          managedSiteStatus: undefined,
        },
      )
      expect(openWithAccountMock).not.toHaveBeenCalled()
      expect(toastSuccessMock).toHaveBeenCalledWith("credential import queued")
    })
  }, 30_000)

  it("opens Kilo Code profile export for service credentials", async () => {
    const user = await renderExpandedServiceCredentialDialog()

    await selectExportAction(user, "keyManagement:actions.exportToKiloCode")

    await waitFor(() => {
      expect(kiloCodeProfileExportDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          profile: expect.objectContaining({
            baseUrl: "https://api.example.invalid/v1",
            apiKey: "sk-service-credential-secret",
            name: "SharedChat - Codex service key",
          }),
        }),
      )
    })
    act(() => {
      kiloCodeProfileExportDialogMock.mock.calls[0]?.[0].onClose()
    })
    expect(kiloCodeExportDialogMock).not.toHaveBeenCalled()
  })

  it("keeps masked-key copy failures localized to the action and shows the error message", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-abcd************wxyz",
      },
    ])
    resolveApiTokenKeyMock.mockRejectedValueOnce(
      new Error("masked fetch failed"),
    )

    const user = await renderExpandedDetails()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    await waitFor(() => {
      expect(resolveApiTokenKeyMock).toHaveBeenCalled()
      expect(writeText).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith("masked fetch failed")
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    })
  })

  it("shows the resolver error message when a saved masked key cannot be copied", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-abcd************wxyz",
      },
    ])
    resolveApiTokenKeyMock.mockRejectedValueOnce(
      new ApiError(
        "messages:errors.tokenSecretUnavailable",
        undefined,
        undefined,
        API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
      ),
    )

    const user = await renderExpandedDetails()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    await waitFor(() => {
      expect(resolveApiTokenKeyMock).toHaveBeenCalled()
      expect(writeText).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.tokenSecretUnavailable",
      )
    })
  })

  it("exports account tokens to external tools with the account token payload", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = await renderExpandedDetails()

    await selectExportAction(user, "keyManagement:actions.exportToCCSwitch")
    expect(ccSwitchDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ id: "acc-1" }),
        token: expect.objectContaining({ id: 1, key: "sk-test" }),
      }),
    )

    await selectExportAction(user, "keyManagement:actions.exportToKiloCode")
    await waitFor(() => {
      expect(kiloCodeExportDialogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          initialSelectedSiteIds: ["acc-1"],
          initialSelectedTokenIdsBySite: {
            "acc-1": ["1"],
          },
        }),
      )
    })
    act(() => {
      kiloCodeExportDialogMock.mock.calls[0]?.[0].onClose()
    })

    await selectExportAction(user, "keyManagement:actions.importToCliProxy")
    expect(cliProxyDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ id: "acc-1" }),
        token: expect.objectContaining({ id: 1, key: "sk-test" }),
      }),
    )
    act(() => {
      cliProxyDialogMock.mock.calls[0]?.[0].onClose()
    })

    await selectExportAction(
      user,
      "keyManagement:actions.importToClaudeCodeRouter",
    )
    expect(claudeCodeRouterDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ id: "acc-1" }),
        token: expect.objectContaining({ id: 1, key: "sk-test" }),
        routerApiKey: "ccr-management-key",
        routerBaseUrl: "https://router.example.invalid",
      }),
    )
    act(() => {
      claudeCodeRouterDialogMock.mock.calls[0]?.[0].onClose()
    })
  }, 30_000)

  it("saves a custom AIHubMix one-time key to an API credential profile without closing the dialog", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 10,
      key: "sk-custom-full-secret",
      name: "My Key",
    })
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "AIHubMix - My Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
      apiKey: "sk-custom-full-secret",
      tagIds: AIHUBMIX_ACCOUNT.tagIds,
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    const onClose = vi.fn()

    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={onClose}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    )
    const tokenNameInput = await screen.findByLabelText(
      /keyManagement:dialog\.tokenName/,
    )
    await user.clear(tokenNameInput)
    await user.type(tokenNameInput, "My Key")
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )
    await user.click(
      await screen.findByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
      ),
    )

    await waitFor(() => {
      expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
        name: "AIHubMix - My Key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
        apiKey: "sk-custom-full-secret",
        tagIds: AIHUBMIX_ACCOUNT.tagIds,
      })
    })
    expect(captureApiCredentialProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locator: {
          source: "account_token",
          accountId: AIHUBMIX_ACCOUNT.id,
          siteType: SITE_TYPES.AIHUBMIX,
          tokenId: 10,
        },
        linkedBy: "creation-response",
      }),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "keyManagement:messages.savedToApiProfiles",
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-custom-full-secret")
  })
})
