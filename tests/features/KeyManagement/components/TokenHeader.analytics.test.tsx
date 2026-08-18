import userEvent from "@testing-library/user-event"
import { act, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "~/constants/siteType"
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
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { createDeferred } from "~~/tests/test-utils/deferred"
import {
  RECOVERABLE_ACTION_POLICY,
  renderTokenHeader,
} from "~~/tests/test-utils/keyManagement/TokenHeaderHarness"
import { screen, waitFor, within } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

const {
  completeProductAnalyticsActionMock,
  kelivoExportDialogRenderMock,
  cliProxyDialogRenderMock,
  claudeCodeRouterDialogRenderMock,
  createProfileMock,
  cursorPlusDialogRenderMock,
  kiloCodeDialogRenderMock,
  loggerErrorMock,
  markGatewayGuidanceOnboardingCompletedMock,
  openInCherryStudioMock,
  openWithAccountMock,
  resolveDisplayAccountTokenForSecretMock,
  showResultToastMock,
  startProductAnalyticsActionMock,
  userPreferencesContextMock,
  verifyCliDialogRenderMock,
  verifyDialogRenderMock,
} = vi.hoisted(() => ({
  completeProductAnalyticsActionMock: vi.fn(),
  kelivoExportDialogRenderMock: vi.fn(),
  cliProxyDialogRenderMock: vi.fn(),
  claudeCodeRouterDialogRenderMock: vi.fn(),
  createProfileMock: vi.fn(),
  cursorPlusDialogRenderMock: vi.fn(),
  kiloCodeDialogRenderMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  markGatewayGuidanceOnboardingCompletedMock: vi.fn(),
  openInCherryStudioMock: vi.fn(),
  openWithAccountMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
  showResultToastMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  userPreferencesContextMock: vi.fn(),
  verifyCliDialogRenderMock: vi.fn(),
  verifyDialogRenderMock: vi.fn(),
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({ openWithAccount: openWithAccountMock }),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => userPreferencesContextMock(),
}))

vi.mock("~/components/KiloCodeExportDialog", () => ({
  KiloCodeExportDialog: (props: unknown) => {
    kiloCodeDialogRenderMock(props)
    return null
  },
}))

vi.mock("~/components/KelivoExportDialog", () => ({
  KelivoExportDialog: (props: unknown) => {
    kelivoExportDialogRenderMock(props)
    const { isOpen, onClose } = props as {
      isOpen: boolean
      onClose: () => void
    }
    return isOpen ? (
      <button type="button" onClick={onClose}>
        close Kelivo export
      </button>
    ) : null
  },
}))

vi.mock("~/components/CursorPlusExportDialog", () => ({
  CursorPlusExportDialog: (props: unknown) => {
    cursorPlusDialogRenderMock(props)
    const { isOpen, onClose } = props as {
      isOpen: boolean
      onClose: () => void
    }
    return isOpen ? (
      <div role="dialog" aria-label="Cursor++ export">
        <button type="button" onClick={onClose}>
          close Cursor++ export
        </button>
      </div>
    ) : null
  },
}))

vi.mock("~/components/ClaudeCodeRouterImportDialog", () => ({
  ClaudeCodeRouterImportDialog: (props: unknown) => {
    claudeCodeRouterDialogRenderMock(props)
    return null
  },
}))

vi.mock("~/components/CliProxyExportDialog", () => ({
  CliProxyExportDialog: (props: unknown) => {
    cliProxyDialogRenderMock(props)
    return null
  },
}))

vi.mock("~/components/dialogs/VerifyCliSupportDialog", () => ({
  VerifyCliSupportDialog: (props: unknown) => {
    verifyCliDialogRenderMock(props)
    const { isOpen, profile } = props as {
      isOpen: boolean
      profile: { apiKey: string; baseUrl: string } | null
    }
    return isOpen && profile ? (
      <div
        data-testid="verify-cli-dialog-mock"
        data-api-key={profile.apiKey}
        data-base-url={profile.baseUrl}
      />
    ) : null
  },
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog",
  () => ({
    VerifyApiCredentialProfileDialog: (props: unknown) => {
      verifyDialogRenderMock(props)
      const { isOpen, profile } = props as {
        isOpen: boolean
        profile: { apiKey: string; baseUrl: string } | null
      }
      return isOpen && profile ? (
        <div
          data-testid="verify-api-dialog-mock"
          data-api-key={profile.apiKey}
          data-base-url={profile.baseUrl}
        />
      ) : null
    },
  }),
)

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  ACCOUNT_RUNTIME_KEY_SECRET_SOURCES: {
    Auto: "auto",
    AssociatedProfile: "associated-profile",
    ProviderThenAssociatedProfile: "provider-then-associated-profile",
  },
  resolveDisplayAccountTokenForSecret: (...args: unknown[]) =>
    resolveDisplayAccountTokenForSecretMock(...args),
}))

vi.mock("~/services/apiCredentialProfiles/apiCredentialProfileLinks", () => ({
  apiCredentialProfileLinks: {
    capture: async ({ profile }: { profile: unknown }) => ({
      status: "captured",
      profile: await createProfileMock(profile),
    }),
  },
}))

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

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({ error: loggerErrorMock }),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

async function selectExportAction(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const directAction = screen.queryByRole("button", { name })
  if (directAction) {
    await user.click(directAction)
    return
  }

  const openItem = screen.queryByRole("menuitem", { name })
  if (openItem) {
    await user.click(openItem)
    return
  }

  const trigger = screen.getByRole("button", {
    name: "common:actions.export",
  })
  if (trigger.getAttribute("aria-expanded") !== "true") {
    await user.click(trigger)
  }
  await user.click(screen.getByRole("menuitem", { name }))
}

describe("TokenHeader analytics", () => {
  beforeEach(() => {
    completeProductAnalyticsActionMock.mockReset()
    kelivoExportDialogRenderMock.mockReset()
    cliProxyDialogRenderMock.mockReset()
    claudeCodeRouterDialogRenderMock.mockReset()
    createProfileMock.mockReset()
    cursorPlusDialogRenderMock.mockReset()
    kiloCodeDialogRenderMock.mockReset()
    markGatewayGuidanceOnboardingCompletedMock.mockReset()
    openInCherryStudioMock.mockReset()
    openWithAccountMock.mockReset()
    resolveDisplayAccountTokenForSecretMock.mockReset()
    showResultToastMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    verifyCliDialogRenderMock.mockReset()
    verifyDialogRenderMock.mockReset()
    userPreferencesContextMock.mockReset()
    userPreferencesContextMock.mockReturnValue({
      claudeCodeRouterApiKey: "router-key",
      claudeCodeRouterBaseUrl: "https://router.example.invalid",
      cliProxyBaseUrl: "https://cli-proxy.example.invalid",
      cliProxyManagementKey: "cli-proxy-key",
      markGatewayGuidanceOnboardingCompleted:
        markGatewayGuidanceOnboardingCompletedMock,
      managedSiteType: "new-api",
    })
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("keeps the full secret action set for recoverable account tokens", () => {
    renderTokenHeader()

    expect(
      screen.getByRole("button", { name: "common:actions.copyKey" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "keyManagement:actions.verifyApi" }),
    ).toBeVisible()
    expect(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
      ),
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "keyManagement:actions.editKey" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:actions.deleteKey",
      }),
    ).toBeVisible()
  })

  it("places the unified API credential menu after export actions", () => {
    renderTokenHeader()

    const toolbar = screen.getByRole("toolbar", {
      name: "keyManagement:actionToolbar.label",
    })
    const quickActionsGroup = within(toolbar).getByRole("group", {
      name: "keyManagement:actionToolbar.quickActions",
    })
    const integrationsGroup = within(toolbar).getByRole("group", {
      name: "keyManagement:actionToolbar.integrationsAndExport",
    })
    const diagnosticsGroup = within(toolbar).getByRole("group", {
      name: "keyManagement:actionToolbar.diagnostics",
    })
    const managementGroup = within(toolbar).getByRole("group", {
      name: "keyManagement:actionToolbar.management",
    })

    expect(
      within(quickActionsGroup).getByRole("button", {
        name: "common:actions.copyKey",
      }),
    ).toBeVisible()
    expect(
      within(integrationsGroup).getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    ).toBeVisible()
    const exportButton = within(integrationsGroup).getByRole("button", {
      name: "common:actions.export",
    })
    const apiCredentialButton = within(integrationsGroup).getByTestId(
      KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
    )
    expect(
      screen.getAllByTestId(
        KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
      ),
    ).toHaveLength(1)
    expect(apiCredentialButton).toHaveClass("hover:bg-accent")
    expect(apiCredentialButton).not.toHaveClass("border")
    expect(
      exportButton.compareDocumentPosition(apiCredentialButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      within(diagnosticsGroup).getByRole("button", {
        name: "keyManagement:actions.verifyApi",
      }),
    ).toBeVisible()
    expect(
      within(managementGroup).getByRole("button", {
        name: "keyManagement:actions.deleteKey",
      }),
    ).toBeVisible()
  })

  it("does not separate an association-only action from management", () => {
    renderTokenHeader({
      actionPolicy: {
        ...RECOVERABLE_ACTION_POLICY,
        copySecret: false,
        exportSecret: false,
        verifySecret: false,
      },
      association: {
        status: "linked",
        label: "keyManagement:credentialAssociation.linked",
        actionLabel: "keyManagement:credentialAssociation.viewCredential",
        onOpen: vi.fn(),
      },
    })

    const toolbar = screen.getByRole("toolbar", {
      name: "keyManagement:actionToolbar.label",
    })
    const managementGroup = within(toolbar).getByRole("group", {
      name: "keyManagement:actionToolbar.management",
    })
    expect(
      managementGroup.parentElement?.querySelector('span[aria-hidden="true"]'),
    ).toBeNull()
  })

  it("uses the linked identity menu without offering another save", async () => {
    const user = userEvent.setup()
    renderTokenHeader({
      association: {
        status: "linked",
        label: "keyManagement:credentialAssociation.linked",
        actionLabel: "keyManagement:credentialAssociation.viewCredential",
        onOpen: vi.fn(),
      },
    })

    await user.click(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
      ),
    )
    expect(
      screen.queryByRole("menuitem", {
        name: "keyManagement:actions.saveToApiProfiles",
      }),
    ).not.toBeInTheDocument()
  })

  it("offers save and existing-credential actions in the unlinked menu", async () => {
    const user = userEvent.setup()
    renderTokenHeader({
      association: {
        status: "unlinked",
        label: "apiCredentialProfiles:association.notLinked",
        actionLabel: "apiCredentialProfiles:association.linkExisting",
        associateLabel: "apiCredentialProfiles:association.linkExisting",
        onAssociate: vi.fn(),
      },
    })

    await user.click(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
      ),
    )
    expect(
      screen.getByRole("menuitem", {
        name: "keyManagement:actions.saveToApiProfiles",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("menuitem", {
        name: "apiCredentialProfiles:association.linkExisting",
      }),
    ).toBeInTheDocument()
  })

  it("omits CC Switch when its export opener is unavailable", async () => {
    const user = userEvent.setup()
    renderTokenHeader({ withCCSwitchExport: false })

    await user.click(
      screen.getByRole("button", { name: "common:actions.export" }),
    )

    expect(
      screen.queryByRole("menuitem", {
        name: "keyManagement:actions.exportToCCSwitch",
      }),
    ).not.toBeInTheDocument()
  })

  it("opens Cursor++ export from a recoverable token row", async () => {
    const user = userEvent.setup()
    renderTokenHeader()

    await selectExportAction(user, "keyManagement:actions.exportToCursorPlus")

    expect(
      screen.getByRole("dialog", { name: "Cursor++ export" }),
    ).toBeVisible()
    expect(cursorPlusDialogRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isOpen: true,
        account: expect.objectContaining({ id: "acc-1" }),
        runtimeKey: expect.objectContaining({
          accountId: "acc-1",
          secret: "sk-sensitive-original",
          tokenId: 1,
        }),
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "close Cursor++ export" }),
    )
    expect(
      screen.queryByRole("dialog", { name: "Cursor++ export" }),
    ).not.toBeInTheDocument()
  })

  it("omits secret-dependent actions and dialogs for AIHubMix tokens", () => {
    renderTokenHeader({
      account: createAccount({
        id: "aihubmix-account",
        name: "AIHubMix Account",
        siteType: SITE_TYPES.AIHUBMIX,
        baseUrl: AIHUBMIX_WEB_ORIGIN,
      }),
      token: createToken({
        id: 8,
        name: "Masked Key",
        accountId: "aihubmix-account",
        accountName: "AIHubMix Account",
        key: "sk-masked",
      }),
    })

    const unavailableActions = [
      "common:actions.copyKey",
      "keyManagement:actions.verifyApi",
      "keyManagement:actions.verifyCliSupport",
      "keyManagement:actions.saveToApiProfiles",
      "keyManagement:actions.useInCherry",
      "keyManagement:actions.exportToCCSwitch",
      "keyManagement:actions.exportToCursorPlus",
      "keyManagement:actions.exportToKiloCode",
      "keyManagement:actions.importToCliProxy",
      "keyManagement:actions.importToClaudeCodeRouter",
      "keyManagement:actions.importToManagedSite",
    ]

    for (const name of unavailableActions) {
      expect(screen.queryByRole("button", { name })).toBeNull()
    }
    expect(
      screen.queryByTestId(
        KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
      ),
    ).not.toBeInTheDocument()
    expect(kiloCodeDialogRenderMock).not.toHaveBeenCalled()
    expect(claudeCodeRouterDialogRenderMock).not.toHaveBeenCalled()
    expect(cliProxyDialogRenderMock).not.toHaveBeenCalled()
    expect(verifyDialogRenderMock).not.toHaveBeenCalled()
    expect(verifyCliDialogRenderMock).not.toHaveBeenCalled()
    expect(openWithAccountMock).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: "keyManagement:actions.editKey" }),
    ).toBeVisible()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:actions.deleteKey",
      }),
    ).toBeVisible()
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
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
      ),
    )
    await user.click(
      screen.getByRole("menuitem", {
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
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
      ),
    )
    await user.click(
      screen.getByRole("menuitem", {
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
      actionPolicy: RECOVERABLE_ACTION_POLICY,
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
    const openedDialogProps = verifyDialogRenderMock.mock.calls.find(
      ([props]) => (props as { isOpen?: boolean }).isOpen === true,
    )?.[0] as { onClose: () => void }

    act(() => {
      openedDialogProps.onClose()
    })

    await waitFor(() => {
      expect(verifyDialogRenderMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isOpen: false,
        }),
      )
    })
  })

  it("closes an open API verification when the same keyed resource changes security snapshot", async () => {
    const account = createAccount({
      id: "api-generation-account",
      baseUrl: "https://api-before.example.invalid/v1",
      token: "account-credential-before",
    })
    const token = createToken({
      id: 41,
      accountId: account.id,
      key: "masked-api-key-before",
    })
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ ...token, key: "resolved-api-key-before" }),
    )
    const user = userEvent.setup()
    const { rerenderTokenHeader } = renderTokenHeader({ account, token })

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton),
    )

    const openedDialog = await screen.findByTestId("verify-api-dialog-mock")
    expect(openedDialog).toHaveAttribute(
      "data-api-key",
      "resolved-api-key-before",
    )
    expect(openedDialog).toHaveAttribute(
      "data-base-url",
      "https://api-before.example.invalid/v1",
    )

    rerenderTokenHeader({
      account: {
        ...account,
        name: "Renamed account",
        tagIds: ["refreshed-tag"],
      },
      token: {
        ...token,
        name: "Renamed token",
        accountName: "Renamed account",
      },
      isManagedSiteStatusChecking: true,
    })
    expect(screen.getByTestId("verify-api-dialog-mock")).toBeVisible()

    rerenderTokenHeader({
      account: {
        ...account,
        baseUrl: "https://api-after.example.invalid/v1",
        token: "account-credential-after",
      },
      token,
    })

    expect(screen.queryByTestId("verify-api-dialog-mock")).toBeNull()
    expect(verifyDialogRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false, profile: null }),
    )
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
        message: "keyManagement:messages.verifyApiFailed",
      })
    })
    expect(JSON.stringify(showResultToastMock.mock.calls)).not.toContain(
      "sk-sensitive",
    )
    expect(JSON.stringify(showResultToastMock.mock.calls)).not.toContain(
      "verification exposed",
    )
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
    const openedDialogProps = verifyCliDialogRenderMock.mock.calls.find(
      ([props]) => (props as { isOpen?: boolean }).isOpen === true,
    )?.[0] as { onClose: () => void }

    act(() => {
      openedDialogProps.onClose()
    })
    expect(
      JSON.stringify(completeProductAnalyticsActionMock.mock.calls),
    ).not.toContain(resolvedSecret)
  })

  it("closes an open CLI verification when the same keyed resource changes security snapshot", async () => {
    const account = createAccount({
      id: "cli-generation-account",
      baseUrl: "https://cli-before.example.invalid/v1",
    })
    const token = createToken({
      id: 42,
      accountId: account.id,
      key: "masked-cli-key-before",
    })
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ ...token, key: "resolved-cli-key-before" }),
    )
    const user = userEvent.setup()
    const { rerenderTokenHeader } = renderTokenHeader({ account, token })

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenCliSupportButton),
    )

    const openedDialog = await screen.findByTestId("verify-cli-dialog-mock")
    expect(openedDialog).toHaveAttribute(
      "data-api-key",
      "resolved-cli-key-before",
    )
    expect(openedDialog).toHaveAttribute(
      "data-base-url",
      "https://cli-before.example.invalid/v1",
    )

    rerenderTokenHeader({
      account,
      token,
      isManagedSiteStatusChecking: true,
    })
    expect(screen.getByTestId("verify-cli-dialog-mock")).toBeVisible()

    rerenderTokenHeader({
      account,
      token: { ...token, key: "masked-cli-key-after" },
    })

    expect(screen.queryByTestId("verify-cli-dialog-mock")).toBeNull()
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
        message: "keyManagement:messages.verifyCliSupportFailed",
      })
    })
    expect(JSON.stringify(showResultToastMock.mock.calls)).not.toContain(
      "sk-sensitive-cli",
    )
    expect(JSON.stringify(showResultToastMock.mock.calls)).not.toContain(
      "cli verification exposed",
    )
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

    await selectExportAction(user, "keyManagement:actions.useInCherry")

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

  it("opens an editable Kelivo export dialog with the resolved account token", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ id: 1, key: "sk-resolved" }),
    )

    const user = userEvent.setup()
    renderTokenHeader()

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    await waitFor(() => {
      expect(kelivoExportDialogRenderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          initialValue: expect.objectContaining({
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            apiKey: "sk-resolved",
          }),
        }),
      )
    })
    expect(startProductAnalyticsActionMock).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("button", { name: "close Kelivo export" }),
    )
    expect(
      screen.queryByRole("button", { name: "close Kelivo export" }),
    ).not.toBeInTheDocument()
  })

  it("redacts credential values from Kelivo export errors", async () => {
    resolveDisplayAccountTokenForSecretMock.mockRejectedValueOnce(
      new Error(
        "Provider rejected sk-sensitive-original because the account is suspended",
      ),
    )

    const user = userEvent.setup()
    renderTokenHeader()

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    await waitFor(() => {
      expect(showResultToastMock).toHaveBeenCalledWith({
        success: false,
        message: "messages:errors.operation.failed",
      })
    })
    expect(JSON.stringify(showResultToastMock.mock.calls)).not.toContain(
      "sk-sensitive-original",
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("falls back to the local unknown error for a blank Kelivo failure", async () => {
    resolveDisplayAccountTokenForSecretMock.mockRejectedValueOnce(new Error(""))

    const user = userEvent.setup()
    renderTokenHeader()

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")

    await waitFor(() => {
      expect(showResultToastMock).toHaveBeenCalledWith({
        success: false,
        message: "messages:errors.operation.failed",
      })
    })
  })

  it("ignores a pending Kelivo secret after export permission is revoked", async () => {
    const deferred = createDeferred<ReturnType<typeof createToken>>()
    resolveDisplayAccountTokenForSecretMock.mockReturnValueOnce(
      deferred.promise,
    )
    const user = userEvent.setup()
    const { rerenderTokenHeader } = renderTokenHeader()

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")
    rerenderTokenHeader({
      actionPolicy: { ...RECOVERABLE_ACTION_POLICY, exportSecret: false },
    })

    await act(async () => {
      deferred.resolve(createToken({ id: 1, key: "sk-stale-permission" }))
      await deferred.promise
    })
    rerenderTokenHeader({ actionPolicy: RECOVERABLE_ACTION_POLICY })

    expect(kelivoExportDialogRenderMock).not.toHaveBeenCalled()
    expect(showResultToastMock).not.toHaveBeenCalled()
  })

  it("ignores a pending Kelivo secret after the token changes", async () => {
    const deferred = createDeferred<ReturnType<typeof createToken>>()
    resolveDisplayAccountTokenForSecretMock.mockReturnValueOnce(
      deferred.promise,
    )
    const user = userEvent.setup()
    const account = createAccount({ id: "acc-1" })
    const token = createToken({ id: 1, accountId: account.id })
    const { rerenderTokenHeader } = renderTokenHeader({ account, token })

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")
    rerenderTokenHeader({
      account,
      token: createToken({ id: 2, accountId: account.id }),
    })

    await act(async () => {
      deferred.resolve(createToken({ id: 1, key: "sk-stale-token" }))
      await deferred.promise
    })

    expect(kelivoExportDialogRenderMock).not.toHaveBeenCalled()
    expect(showResultToastMock).not.toHaveBeenCalled()
  })

  it("tracks Cherry Studio export as unknown failure when opening throws", async () => {
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce(
      createToken({ id: 1, key: "sk-resolved" }),
    )
    openInCherryStudioMock.mockImplementationOnce(() => {
      throw new Error("open failed for sk-resolved")
    })

    const user = userEvent.setup()
    renderTokenHeader()

    await selectExportAction(user, "keyManagement:actions.useInCherry")

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
    expect(JSON.stringify(showResultToastMock.mock.calls)).not.toContain(
      "sk-resolved",
    )
  })

  it("tracks managed-site single token import as success when the dialog opens", async () => {
    openWithAccountMock.mockResolvedValueOnce({ opened: true })

    const user = userEvent.setup()
    renderTokenHeader()

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

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

  it("keeps managed-site import success when recording guidance completion fails", async () => {
    openWithAccountMock.mockResolvedValueOnce({ opened: true })
    markGatewayGuidanceOnboardingCompletedMock.mockRejectedValueOnce(
      new Error("preferences unavailable"),
    )

    const user = userEvent.setup()
    renderTokenHeader()
    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

    const onImportCompleted = openWithAccountMock.mock.calls[0]?.[2]
    expect(onImportCompleted).toEqual(expect.any(Function))
    act(() => {
      onImportCompleted?.({ success: true })
    })

    await waitFor(() => {
      expect(markGatewayGuidanceOnboardingCompletedMock).toHaveBeenCalledTimes(
        1,
      )
    })
    expect(showResultToastMock).toHaveBeenCalledWith({ success: true })
  })

  it("highlights managed-site import without opening the import dialog", async () => {
    vi.useFakeTimers()
    try {
      renderTokenHeader({ guidedManagedSiteImportRequest: "request-1" })
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      const importButton = screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton,
      )
      expect(importButton).toHaveAttribute("data-guidance-highlight", "true")
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(importButton).not.toHaveAttribute("data-guidance-highlight")
      expect(openWithAccountMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("clears export dialogs and consumes guided requests when export permission is revoked", async () => {
    const user = userEvent.setup()
    const { rerenderTokenHeader } = renderTokenHeader({
      guidedManagedSiteImportRequest: "request-1",
    })

    await selectExportAction(user, "keyManagement:actions.exportToKiloCode")
    await selectExportAction(user, "keyManagement:actions.exportToCursorPlus")
    await selectExportAction(user, "keyManagement:actions.importToCliProxy")
    await selectExportAction(
      user,
      "keyManagement:actions.importToClaudeCodeRouter",
    )
    expect(kiloCodeDialogRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true }),
    )
    expect(
      screen.getByRole("dialog", { name: "Cursor++ export" }),
    ).toBeVisible()
    expect(cliProxyDialogRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true }),
    )
    expect(claudeCodeRouterDialogRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true }),
    )

    rerenderTokenHeader({
      actionPolicy: { ...RECOVERABLE_ACTION_POLICY, exportSecret: false },
      guidedManagedSiteImportRequest: "request-1",
    })
    kiloCodeDialogRenderMock.mockClear()
    cliProxyDialogRenderMock.mockClear()
    claudeCodeRouterDialogRenderMock.mockClear()

    rerenderTokenHeader({ guidedManagedSiteImportRequest: "request-1" })
    expect(
      screen.queryByRole("dialog", { name: "Cursor++ export" }),
    ).not.toBeInTheDocument()
    expect(kiloCodeDialogRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    )
    expect(cliProxyDialogRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    )
    expect(claudeCodeRouterDialogRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false }),
    )
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton),
    ).not.toHaveAttribute("data-guidance-highlight")

    rerenderTokenHeader({ guidedManagedSiteImportRequest: "request-2" })
    const importButton = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton,
    )
    await waitFor(() =>
      expect(importButton).toHaveAttribute("data-guidance-highlight", "true"),
    )
  })

  it("invalidates pending API and CLI verification when permission is revoked", async () => {
    const apiResolution = createDeferred<ReturnType<typeof createToken>>()
    const cliResolution = createDeferred<ReturnType<typeof createToken>>()
    resolveDisplayAccountTokenForSecretMock
      .mockReturnValueOnce(apiResolution.promise)
      .mockReturnValueOnce(cliResolution.promise)
    const user = userEvent.setup()
    const { rerenderTokenHeader } = renderTokenHeader()

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton),
    )
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenCliSupportButton),
    )
    expect(resolveDisplayAccountTokenForSecretMock).toHaveBeenCalledTimes(2)

    rerenderTokenHeader({
      actionPolicy: { ...RECOVERABLE_ACTION_POLICY, verifySecret: false },
    })
    verifyDialogRenderMock.mockClear()
    verifyCliDialogRenderMock.mockClear()
    await act(async () => {
      apiResolution.resolve(createToken({ key: "resolved-api-key" }))
      cliResolution.resolve(createToken({ key: "resolved-cli-key" }))
      await Promise.all([apiResolution.promise, cliResolution.promise])
    })
    rerenderTokenHeader({ actionPolicy: RECOVERABLE_ACTION_POLICY })

    expect(verifyDialogRenderMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: false, profile: null }),
    )
    expect(verifyCliDialogRenderMock).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledTimes(2)
    expect(completeProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      { diagnostics: { execution: { staleResponseIgnored: true } } },
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      { diagnostics: { execution: { staleResponseIgnored: true } } },
    )
  })

  it("ignores late API and CLI verification failures after permission is revoked", async () => {
    const apiResolution = createDeferred<ReturnType<typeof createToken>>()
    const cliResolution = createDeferred<ReturnType<typeof createToken>>()
    resolveDisplayAccountTokenForSecretMock
      .mockReturnValueOnce(apiResolution.promise)
      .mockReturnValueOnce(cliResolution.promise)
    const user = userEvent.setup()
    const { rerenderTokenHeader } = renderTokenHeader()

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton),
    )
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenCliSupportButton),
    )
    rerenderTokenHeader({
      actionPolicy: { ...RECOVERABLE_ACTION_POLICY, verifySecret: false },
    })

    await act(async () => {
      apiResolution.reject(new Error("stale API resolution failure"))
      cliResolution.reject(new Error("stale CLI resolution failure"))
      await Promise.allSettled([apiResolution.promise, cliResolution.promise])
    })

    expect(completeProductAnalyticsActionMock).toHaveBeenCalledTimes(2)
    expect(completeProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      { diagnostics: { execution: { staleResponseIgnored: true } } },
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      { diagnostics: { execution: { staleResponseIgnored: true } } },
    )
    expect(showResultToastMock).not.toHaveBeenCalled()
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it("cancels deferred API and CLI verification successes after unmount", async () => {
    const apiResolution = createDeferred<ReturnType<typeof createToken>>()
    const cliResolution = createDeferred<ReturnType<typeof createToken>>()
    resolveDisplayAccountTokenForSecretMock
      .mockReturnValueOnce(apiResolution.promise)
      .mockReturnValueOnce(cliResolution.promise)
    const user = userEvent.setup()
    const { unmount } = renderTokenHeader()

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton),
    )
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenCliSupportButton),
    )
    unmount()
    verifyDialogRenderMock.mockClear()
    verifyCliDialogRenderMock.mockClear()

    await act(async () => {
      apiResolution.resolve(createToken({ key: "resolved-stale-api-key" }))
      cliResolution.resolve(createToken({ key: "resolved-stale-cli-key" }))
      await Promise.all([apiResolution.promise, cliResolution.promise])
    })

    expect(completeProductAnalyticsActionMock).toHaveBeenCalledTimes(2)
    expect(completeProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      { diagnostics: { execution: { staleResponseIgnored: true } } },
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      { diagnostics: { execution: { staleResponseIgnored: true } } },
    )
    expect(verifyDialogRenderMock).not.toHaveBeenCalled()
    expect(verifyCliDialogRenderMock).not.toHaveBeenCalled()
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it("cancels deferred API and CLI verification failures after unmount", async () => {
    const apiResolution = createDeferred<ReturnType<typeof createToken>>()
    const cliResolution = createDeferred<ReturnType<typeof createToken>>()
    resolveDisplayAccountTokenForSecretMock
      .mockReturnValueOnce(apiResolution.promise)
      .mockReturnValueOnce(cliResolution.promise)
    const user = userEvent.setup()
    const { unmount } = renderTokenHeader()

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton),
    )
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenCliSupportButton),
    )
    unmount()

    await act(async () => {
      apiResolution.reject(new Error("stale unmounted API failure"))
      cliResolution.reject(new Error("stale unmounted CLI failure"))
      await Promise.allSettled([apiResolution.promise, cliResolution.promise])
    })

    expect(completeProductAnalyticsActionMock).toHaveBeenCalledTimes(2)
    expect(completeProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      { diagnostics: { execution: { staleResponseIgnored: true } } },
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      { diagnostics: { execution: { staleResponseIgnored: true } } },
    )
    expect(showResultToastMock).not.toHaveBeenCalled()
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it("keeps current StrictMode verification valid while cancelling a prior same-ID resource generation", async () => {
    const staleApiResolution = createDeferred<ReturnType<typeof createToken>>()
    const currentCliToken = createToken({ key: "resolved-current-cli-key" })
    resolveDisplayAccountTokenForSecretMock
      .mockReturnValueOnce(staleApiResolution.promise)
      .mockResolvedValueOnce(currentCliToken)
    const initialAccount = createAccount({
      id: "strict-account",
      name: "Strict Account",
      baseUrl: "https://before.example.invalid/v1",
      token: "before-account-credential",
      cookieAuthSessionCookie: "session=before",
    })
    const initialToken = createToken({
      id: 77,
      accountId: initialAccount.id,
      accountName: initialAccount.name,
      key: "masked-before-key",
      name: "Same Token",
    })
    const changedAccount = createAccount({
      ...initialAccount,
      baseUrl: "https://after.example.invalid/v1",
      token: "after-account-credential",
      cookieAuthSessionCookie: "session=after",
    })
    const changedToken = createToken({
      ...initialToken,
      key: "masked-after-key",
    })
    const user = userEvent.setup()
    const { rerenderTokenHeader } = renderTokenHeader(
      { account: initialAccount, token: initialToken },
      { strictMode: true },
    )

    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton),
    )
    rerenderTokenHeader({ account: changedAccount, token: changedToken })
    verifyDialogRenderMock.mockClear()
    await user.click(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.verifyTokenCliSupportButton),
    )

    await waitFor(() => {
      expect(verifyCliDialogRenderMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isOpen: true,
          profile: expect.objectContaining({
            apiKey: "resolved-current-cli-key",
            baseUrl: "https://after.example.invalid/v1",
          }),
        }),
      )
    })

    await act(async () => {
      staleApiResolution.resolve(createToken({ key: "resolved-stale-api-key" }))
      await staleApiResolution.promise
    })

    expect(verifyDialogRenderMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ isOpen: true }),
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledTimes(2)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      { diagnostics: { execution: { staleResponseIgnored: true } } },
    )
    expect(showResultToastMock).not.toHaveBeenCalled()
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it("tracks managed-site single token import as skipped when preparation does not open", async () => {
    openWithAccountMock.mockResolvedValueOnce({ opened: false })

    const user = userEvent.setup()
    renderTokenHeader()

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

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

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")

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

describe("TokenHeader shared card composition", () => {
  it("renders the token title and row actions", async () => {
    renderTokenHeader({
      token: createToken({
        id: 1,
        name: "Readable Key Card Name",
        accountName: "Long Account Name",
      }),
    })

    expect(
      await screen.findByRole("heading", {
        name: "Readable Key Card Name",
      }),
    ).toBeVisible()
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.tokenRowActions),
    ).toBeVisible()
  })
})
