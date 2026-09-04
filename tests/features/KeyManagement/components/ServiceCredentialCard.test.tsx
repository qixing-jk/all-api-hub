import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ServiceCredentialCard } from "~/features/KeyManagement/components/ServiceCredentialCard"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
} from "~/services/managedSites/channelMatch"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const {
  mockCCSwitchDialog,
  mockClaudeCodeRouterDialog,
  mockCliProxyDialog,
  mockCursorPlusDialog,
  mockKiloCodeDialog,
  mockOpenInCherryStudio,
  mockKelivoExportDialog,
  mockOpenSettingsTab,
  mockOpenWithCredentials,
  mockSaveApiCredentialProfiles,
  mockShowResultToast,
  mockUserPreferences,
  mockVerifyApiDialog,
  mockVerifyCliDialog,
} = vi.hoisted(() => ({
  mockCCSwitchDialog: vi.fn(),
  mockClaudeCodeRouterDialog: vi.fn(),
  mockCliProxyDialog: vi.fn(),
  mockCursorPlusDialog: vi.fn(),
  mockKiloCodeDialog: vi.fn(),
  mockOpenInCherryStudio: vi.fn(),
  mockKelivoExportDialog: vi.fn(),
  mockOpenSettingsTab: vi.fn(),
  mockOpenWithCredentials: vi.fn(),
  mockSaveApiCredentialProfiles: vi.fn(),
  mockShowResultToast: vi.fn(),
  mockUserPreferences: {
    claudeCodeRouterApiKey: "ccr-management-key",
    claudeCodeRouterBaseUrl: "https://router.example.invalid",
    cliProxyBaseUrl: "https://cliproxy.example.invalid",
    cliProxyManagementKey: "cliproxy-management-key",
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
    managedSiteType: "new-api",
  },
  mockVerifyApiDialog: vi.fn(),
  mockVerifyCliDialog: vi.fn(),
}))

vi.mock("~/components/CCSwitchExportDialog", () => ({
  CCSwitchExportDialog: (props: unknown) => {
    mockCCSwitchDialog(props)
    return null
  },
}))

vi.mock("~/components/ClaudeCodeRouterImportDialog", () => ({
  ClaudeCodeRouterImportDialog: (props: unknown) => {
    mockClaudeCodeRouterDialog(props)
    return null
  },
}))

vi.mock("~/components/CliProxyExportDialog", () => ({
  CliProxyExportDialog: (props: unknown) => {
    mockCliProxyDialog(props)
    return null
  },
}))

vi.mock("~/components/CursorPlusExportDialog", () => ({
  CursorPlusExportDialog: (props: unknown) => {
    mockCursorPlusDialog(props)
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

vi.mock("~/components/KelivoExportDialog", () => ({
  KelivoExportDialog: (props: unknown) => {
    mockKelivoExportDialog(props)
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

vi.mock(
  "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog",
  () => ({
    KiloCodeProfileExportDialog: (props: unknown) => {
      mockKiloCodeDialog(props)
      return null
    },
  }),
)

vi.mock("~/components/dialogs/ChannelDialog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/components/dialogs/ChannelDialog")>()

  return {
    ...actual,
    useChannelDialog: () => ({
      openWithCredentials: (...args: unknown[]) =>
        mockOpenWithCredentials(...args),
    }),
  }
})

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => mockUserPreferences,
}))

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted:
      mockUserPreferences.markGatewayGuidanceOnboardingCompleted,
  }),
}))

vi.mock("~/services/integrations/cherryStudio", () => ({
  OpenInCherryStudio: (...args: unknown[]) => mockOpenInCherryStudio(...args),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: (...args: unknown[]) => mockShowResultToast(...args),
}))

vi.mock("~/utils/navigation", () => ({
  openSettingsTab: (...args: unknown[]) => mockOpenSettingsTab(...args),
}))

vi.mock(
  "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction",
  () => ({
    saveAccountRuntimeKeysToApiCredentialProfiles: (...args: unknown[]) =>
      mockSaveApiCredentialProfiles(...args),
  }),
)

vi.mock(
  "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog",
  () => ({
    VerifyApiCredentialProfileDialog: (props: unknown) => {
      mockVerifyApiDialog(props)
      return null
    },
  }),
)

vi.mock("~/components/dialogs/VerifyCliSupportDialog", () => ({
  VerifyCliSupportDialog: (props: unknown) => {
    mockVerifyCliDialog(props)
    return null
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

  await user.click(
    screen.getByRole("button", { name: "common:actions.export" }),
  )
  await user.click(screen.getByRole("menuitem", { name }))
}

describe("ServiceCredentialCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserPreferences.claudeCodeRouterApiKey = "ccr-management-key"
    mockUserPreferences.claudeCodeRouterBaseUrl =
      "https://router.example.invalid"
    mockUserPreferences.cliProxyBaseUrl = "https://cliproxy.example.invalid"
    mockUserPreferences.cliProxyManagementKey = "cliproxy-management-key"
    mockUserPreferences.managedSiteType = "new-api"
    mockOpenWithCredentials.mockResolvedValue({ opened: true })
    mockSaveApiCredentialProfiles.mockResolvedValue({ savedCount: 1 })
  })

  it("renders singleton service key details and uses the standard copy action", async () => {
    const user = userEvent.setup()
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
    })
    const onCopy = vi.fn().mockResolvedValue(undefined)
    const onRotate = vi.fn().mockResolvedValue(undefined)

    render(
      <ServiceCredentialCard
        account={account}
        credential={{
          kind: "singleton_service_key",
          service: "codex",
          label: "Codex",
          key: "test-codex-service-key",
          isAuthenticated: true,
          baseUrl: "https://codex.example.invalid",
        }}
        onCopy={onCopy}
        onRotate={onRotate}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.serviceCredentialCard),
    ).toBeInTheDocument()
    expect(screen.getByText("Codex")).toBeInTheDocument()
    expect(screen.queryByText("test-codex-service-key")).not.toBeInTheDocument()
    expect(screen.getByText("test-cod****************-key")).toBeInTheDocument()
    expect(
      screen.getByText("https://codex.example.invalid"),
    ).toBeInTheDocument()
    const toolbar = screen.getByRole("toolbar", {
      name: "keyManagement:actionToolbar.label",
    })
    expect(
      within(toolbar).getByRole("group", {
        name: "keyManagement:actionToolbar.quickActions",
      }),
    ).toBeVisible()
    const integrationsGroup = within(toolbar).getByRole("group", {
      name: "keyManagement:actionToolbar.integrationsAndExport",
    })
    const exportButton = within(integrationsGroup).getByRole("button", {
      name: "common:actions.export",
    })
    const apiCredentialButton = within(integrationsGroup).getByTestId(
      KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
    )
    expect(
      exportButton.compareDocumentPosition(apiCredentialButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      within(toolbar).getByRole("group", {
        name: "keyManagement:actionToolbar.diagnostics",
      }),
    ).toBeVisible()
    expect(
      within(toolbar).getByRole("group", {
        name: "keyManagement:actionToolbar.management",
      }),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:serviceCredential.copy",
      }),
    )
    expect(
      screen.getByRole("button", {
        name: "keyManagement:serviceCredential.copy",
      }),
    ).not.toHaveAttribute("title")
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:serviceCredential.rotate",
      }),
    )

    expect(onCopy).toHaveBeenCalledWith(account)
    expect(onRotate).toHaveBeenCalledWith(account)
  })

  it("renders managed-site status for service credentials", () => {
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      baseUrl: "https://sharedchat.example.invalid",
    })
    const managedSiteStatus: ManagedSiteTokenChannelStatus = {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED,
      matchedChannel: {
        id: 101,
        name: "Existing SharedChat Codex",
      },
      assessment: {
        searchBaseUrl: "https://sharedchat.example.invalid/v1",
        searchCompleted: true,
        url: {
          matched: true,
          candidateCount: 1,
          channel: {
            id: 101,
            name: "Existing SharedChat Codex",
          },
        },
        key: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
          channel: {
            id: 101,
            name: "Existing SharedChat Codex",
          },
        },
        models: {
          comparable: true,
          matched: true,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
          channel: {
            id: 101,
            name: "Existing SharedChat Codex",
          },
        },
      },
    }

    render(
      <ServiceCredentialCard
        account={account}
        credential={{
          kind: "singleton_service_key",
          service: "codex",
          label: "Codex API Key",
          key: "sk-service-credential",
          isAuthenticated: true,
          baseUrl: "https://sharedchat.example.invalid/v1",
        }}
        managedSiteStatus={managedSiteStatus}
        onCopy={vi.fn().mockResolvedValue(undefined)}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.managedSiteStatusBadge),
    ).toHaveTextContent("keyManagement:managedSiteStatus.badges.added")
  })

  it("renders unauthenticated checking and rotating states without an optional base URL", () => {
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
    })

    render(
      <ServiceCredentialCard
        account={account}
        credential={{
          kind: "singleton_service_key",
          service: "codex",
          label: "Codex API Key",
          key: "sk-service-credential",
          isAuthenticated: false,
        }}
        isManagedSiteStatusChecking
        isRotating
        onCopy={vi.fn().mockResolvedValue(undefined)}
        onRotate={vi.fn().mockResolvedValue(undefined)}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.getByText("keyManagement:serviceCredential.notAuthenticated"),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId(KEY_MANAGEMENT_TEST_IDS.managedSiteStatusBadge),
    ).toHaveTextContent("keyManagement:managedSiteStatus.badges.checking")
    expect(
      screen
        .getByText("keyManagement:serviceCredential.rotating")
        .closest("button"),
    ).toBeDisabled()
    expect(
      screen.queryByText("keyManagement:serviceCredential.baseUrl"),
    ).not.toBeInTheDocument()
  })

  it("reuses managed-site config-missing copy and settings action for service credentials", async () => {
    const user = userEvent.setup()
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      baseUrl: "https://sharedchat.example.invalid",
    })
    const managedSiteStatus: ManagedSiteTokenChannelStatus = {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN,
      reason: MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.CONFIG_MISSING,
    }

    render(
      <ServiceCredentialCard
        account={account}
        credential={{
          kind: "singleton_service_key",
          service: "codex",
          label: "Codex API Key",
          key: "sk-service-credential",
          isAuthenticated: true,
          baseUrl: "https://sharedchat.example.invalid/v1",
        }}
        managedSiteStatus={managedSiteStatus}
        onCopy={vi.fn().mockResolvedValue(undefined)}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.getByText(
        "keyManagement:managedSiteStatus.descriptions.configMissingOptional",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:managedSiteStatus.actions.configureChecks",
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:managedSiteStatus.actions.configureChecks",
      }),
    )

    expect(mockOpenSettingsTab).toHaveBeenCalledWith("managedSite", {
      preserveHistory: true,
    })
  })

  it("exposes URL-and-key consumer actions without requiring a token resource", async () => {
    const user = userEvent.setup()
    const onOpenAssociatedCredential = vi.fn()
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      tagIds: ["tag-a"],
      baseUrl: "https://sharedchat.example.invalid",
    })
    const credential = {
      kind: "singleton_service_key" as const,
      service: "codex",
      label: "Codex API Key",
      key: "sk-service-credential",
      isAuthenticated: true,
      baseUrl: "https://sharedchat.example.invalid/v1",
    }

    render(
      <ServiceCredentialCard
        account={account}
        credential={credential}
        onCopy={vi.fn().mockResolvedValue(undefined)}
        association={{
          status: "linked",
          label: "keyManagement:credentialAssociation.linked",
          actionLabel: "keyManagement:credentialAssociation.viewCredential",
          onOpen: onOpenAssociatedCredential,
        }}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const openAssociatedCredential = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.apiCredentialAssociationButton,
    )
    expect(
      openAssociatedCredential.querySelector(".lucide-link-2"),
    ).not.toBeNull()
    await user.click(openAssociatedCredential)
    expect(
      screen.queryByRole("menuitem", {
        name: "keyManagement:actions.saveToApiProfiles",
      }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("menuitem", {
        name: "keyManagement:credentialAssociation.viewCredential",
      }),
    )
    expect(onOpenAssociatedCredential).toHaveBeenCalledOnce()
    expect(mockSaveApiCredentialProfiles).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.verifyApi",
      }),
    )
    await waitFor(() => {
      expect(mockVerifyApiDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          profile: expect.objectContaining({
            id: "service-credential:sharedchat-account:codex",
            name: "SharedChat - Codex API Key",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://sharedchat.example.invalid/v1",
            apiKey: "sk-service-credential",
            tagIds: ["tag-a"],
          }),
        }),
      )
    })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.verifyCliSupport",
      }),
    )
    await waitFor(() => {
      expect(mockVerifyCliDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          profile: expect.objectContaining({
            id: "service-credential:sharedchat-account:codex",
            baseUrl: "https://sharedchat.example.invalid/v1",
            apiKey: "sk-service-credential",
          }),
        }),
      )
    })
  })

  it("offers save and existing-credential actions in the unlinked service menu", async () => {
    const user = userEvent.setup()
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      tagIds: ["tag-a"],
      baseUrl: "https://sharedchat.example.invalid",
    })
    const credential = {
      kind: "singleton_service_key" as const,
      service: "codex",
      label: "Codex API Key",
      key: "sk-service-credential",
      isAuthenticated: true,
      baseUrl: "https://sharedchat.example.invalid/v1",
    }

    render(
      <ServiceCredentialCard
        account={account}
        credential={credential}
        onCopy={vi.fn().mockResolvedValue(undefined)}
        association={{
          status: "unlinked",
          label: "apiCredentialProfiles:association.notLinked",
          actionLabel: "apiCredentialProfiles:association.linkExisting",
          associateLabel: "apiCredentialProfiles:association.linkExisting",
          onAssociate: vi.fn(),
        }}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

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

  it("exposes third-party export consumers from the service credential URL and key", async () => {
    const user = userEvent.setup()
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      tagIds: ["tag-a"],
      baseUrl: "https://sharedchat.example.invalid",
    })
    const credential = {
      kind: "singleton_service_key" as const,
      service: "codex",
      label: "Codex API Key",
      key: "sk-service-credential",
      isAuthenticated: true,
      baseUrl: "https://sharedchat.example.invalid/v1",
    }

    render(
      <ServiceCredentialCard
        account={account}
        credential={credential}
        onCopy={vi.fn().mockResolvedValue(undefined)}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await selectExportAction(user, "keyManagement:actions.useInCherry")
    expect(mockOpenInCherryStudio).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://sharedchat.example.invalid/v1",
        name: "SharedChat - Codex API Key",
      }),
      expect.objectContaining({
        key: "sk-service-credential",
        name: "SharedChat - Codex API Key",
      }),
    )

    await selectExportAction(user, "keyManagement:actions.copyKelivoImportCode")
    expect(mockKelivoExportDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        initialValue: expect.objectContaining({
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://sharedchat.example.invalid/v1",
          apiKey: "sk-service-credential",
          name: "SharedChat - Codex API Key",
        }),
        analyticsContext: expect.objectContaining({
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.CopyServiceCredentialKelivoImportCode,
        }),
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "close Kelivo export" }),
    )
    expect(
      screen.queryByRole("button", { name: "close Kelivo export" }),
    ).not.toBeInTheDocument()

    await selectExportAction(user, "keyManagement:actions.exportToCCSwitch")
    expect(mockCCSwitchDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        account: expect.objectContaining({
          baseUrl: "https://sharedchat.example.invalid/v1",
        }),
        token: expect.objectContaining({ key: "sk-service-credential" }),
      }),
    )

    await selectExportAction(user, "keyManagement:actions.exportToKiloCode")
    expect(mockKiloCodeDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        profile: expect.objectContaining({
          baseUrl: "https://sharedchat.example.invalid/v1",
          apiKey: "sk-service-credential",
        }),
      }),
    )

    await selectExportAction(user, "keyManagement:actions.exportToCursorPlus")
    expect(
      screen.getByRole("dialog", { name: "Cursor++ export" }),
    ).toBeVisible()
    expect(mockCursorPlusDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isOpen: true,
        account,
        runtimeKey: expect.objectContaining({
          baseUrl: "https://sharedchat.example.invalid/v1",
          secret: "sk-service-credential",
          service: "codex",
        }),
      }),
    )
    await user.click(
      screen.getByRole("button", { name: "close Cursor++ export" }),
    )
    expect(
      screen.queryByRole("dialog", { name: "Cursor++ export" }),
    ).not.toBeInTheDocument()

    await selectExportAction(user, "keyManagement:actions.importToCliProxy")
    expect(mockCliProxyDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        account: expect.objectContaining({
          baseUrl: "https://sharedchat.example.invalid/v1",
        }),
        token: expect.objectContaining({ key: "sk-service-credential" }),
      }),
    )

    await selectExportAction(
      user,
      "keyManagement:actions.importToClaudeCodeRouter",
    )
    expect(mockClaudeCodeRouterDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        account: expect.objectContaining({
          baseUrl: "https://sharedchat.example.invalid/v1",
        }),
        token: expect.objectContaining({ key: "sk-service-credential" }),
        routerApiKey: "ccr-management-key",
        routerBaseUrl: "https://router.example.invalid",
      }),
    )

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")
    expect(mockOpenWithCredentials).toHaveBeenCalledWith(
      {
        name: "SharedChat - Codex API Key",
        baseUrl: "https://sharedchat.example.invalid/v1",
        apiKey: "sk-service-credential",
      },
      expect.any(Function),
      {
        managedSiteStatus: undefined,
      },
    )
  }, 30_000)

  it("shows a local error when Cherry Studio cannot be opened", async () => {
    mockOpenInCherryStudio.mockImplementationOnce(() => {
      throw new Error("open failed")
    })
    const user = userEvent.setup()

    render(
      <ServiceCredentialCard
        account={buildDisplaySiteData({
          id: "sharedchat-account",
          name: "SharedChat",
          baseUrl: "https://sharedchat.example.invalid",
        })}
        credential={{
          kind: "singleton_service_key",
          service: "codex",
          label: "Codex API Key",
          key: "sk-service-credential",
          isAuthenticated: true,
          baseUrl: "https://sharedchat.example.invalid/v1",
        }}
        onCopy={vi.fn().mockResolvedValue(undefined)}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await selectExportAction(user, "keyManagement:actions.useInCherry")

    expect(mockShowResultToast).toHaveBeenCalledWith({
      success: false,
      message: "messages:errors.operation.failed",
    })
  })

  it("passes managed-site status hints to single service credential import", async () => {
    const user = userEvent.setup()
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      tagIds: ["tag-a"],
      baseUrl: "https://sharedchat.example.invalid",
    })
    const credential = {
      kind: "singleton_service_key" as const,
      service: "codex",
      label: "Codex API Key",
      key: "sk-service-credential",
      isAuthenticated: true,
      baseUrl: "https://sharedchat.example.invalid/v1",
    }
    const managedSiteStatus: ManagedSiteTokenChannelStatus = {
      status: MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED,
      assessment: {
        searchBaseUrl: "https://sharedchat.example.invalid/v1",
        searchCompleted: true,
        url: {
          matched: false,
          candidateCount: 0,
        },
        key: {
          comparable: true,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_MATCH,
        },
        models: {
          comparable: true,
          matched: false,
          reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
        },
      },
    }

    render(
      <ServiceCredentialCard
        account={account}
        credential={credential}
        managedSiteStatus={managedSiteStatus}
        onCopy={vi.fn().mockResolvedValue(undefined)}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await selectExportAction(user, "keyManagement:actions.importToManagedSite")
    expect(mockOpenWithCredentials).toHaveBeenLastCalledWith(
      {
        name: "SharedChat - Codex API Key",
        baseUrl: "https://sharedchat.example.invalid/v1",
        apiKey: "sk-service-credential",
      },
      expect.any(Function),
      {
        managedSiteStatus,
      },
    )

    mockUserPreferences.markGatewayGuidanceOnboardingCompleted.mockRejectedValueOnce(
      new Error("preference storage unavailable"),
    )
    const onImportCompleted = mockOpenWithCredentials.mock.calls.at(-1)?.[1] as
      | ((result: { success: boolean }) => void)
      | undefined
    expect(onImportCompleted).toEqual(expect.any(Function))
    act(() => {
      onImportCompleted?.({ success: true })
    })

    await waitFor(() => {
      expect(
        mockUserPreferences.markGatewayGuidanceOnboardingCompleted,
      ).toHaveBeenCalledTimes(1)
    })
  })

  it("keeps configuration-dependent exports closed when required settings are missing", async () => {
    const user = userEvent.setup()
    mockUserPreferences.claudeCodeRouterBaseUrl = ""
    mockUserPreferences.cliProxyBaseUrl = ""
    mockUserPreferences.cliProxyManagementKey = ""
    const account = buildDisplaySiteData({
      id: "sharedchat-account",
      name: "SharedChat",
      baseUrl: "https://sharedchat.example.invalid",
    })

    render(
      <ServiceCredentialCard
        account={account}
        credential={{
          kind: "singleton_service_key",
          service: "codex",
          label: "Codex API Key",
          key: "sk-service-credential",
          isAuthenticated: true,
          baseUrl: "https://sharedchat.example.invalid/v1",
        }}
        onCopy={vi.fn().mockResolvedValue(undefined)}
      />,
      {
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await selectExportAction(user, "keyManagement:actions.importToCliProxy")
    await selectExportAction(
      user,
      "keyManagement:actions.importToClaudeCodeRouter",
    )

    expect(mockCliProxyDialog).not.toHaveBeenCalledWith(
      expect.objectContaining({ isOpen: true }),
    )
    expect(mockClaudeCodeRouterDialog).not.toHaveBeenCalledWith(
      expect.objectContaining({ isOpen: true }),
    )
    expect(mockShowResultToast).toHaveBeenCalledWith({
      success: false,
      message: "messages:cliproxy.configMissing",
    })
    expect(mockShowResultToast).toHaveBeenCalledWith({
      success: false,
      message: "messages:claudeCodeRouter.configMissing",
    })
  })
})
