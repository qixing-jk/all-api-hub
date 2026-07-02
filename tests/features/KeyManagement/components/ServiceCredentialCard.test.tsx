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
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockCCSwitchDialog,
  mockClaudeCodeRouterDialog,
  mockCliProxyDialog,
  mockKiloCodeDialog,
  mockOpenInCherryStudio,
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
  mockKiloCodeDialog: vi.fn(),
  mockOpenInCherryStudio: vi.fn(),
  mockOpenSettingsTab: vi.fn(),
  mockOpenWithCredentials: vi.fn(),
  mockSaveApiCredentialProfiles: vi.fn(),
  mockShowResultToast: vi.fn(),
  mockUserPreferences: {
    claudeCodeRouterApiKey: "ccr-management-key",
    claudeCodeRouterBaseUrl: "https://router.example.invalid",
    cliProxyBaseUrl: "https://cliproxy.example.invalid",
    cliProxyManagementKey: "cliproxy-management-key",
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
    saveApiTokensToApiCredentialProfiles: (...args: unknown[]) =>
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
    expect(screen.getByText("test-codex-service-key")).toBeInTheDocument()
    expect(
      screen.getByText("https://codex.example.invalid"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:serviceCredential.copy",
      }),
    )
    expect(
      screen.queryByText("keyManagement:serviceCredential.copy"),
    ).not.toBeInTheDocument()
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

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.saveToApiProfiles",
      }),
    )

    expect(mockSaveApiCredentialProfiles).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "ServiceCredentialCard",
        items: [
          expect.objectContaining({
            account: expect.objectContaining({ id: "sharedchat-account" }),
            credential: expect.objectContaining({ service: "codex" }),
          }),
        ],
      }),
    )

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

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.useInCherry",
      }),
    )
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

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.exportToCCSwitch",
      }),
    )
    await waitFor(() => {
      expect(mockCCSwitchDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          account: expect.objectContaining({
            baseUrl: "https://sharedchat.example.invalid/v1",
          }),
          token: expect.objectContaining({ key: "sk-service-credential" }),
        }),
      )
    })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.exportToKiloCode",
      }),
    )
    await waitFor(() => {
      expect(mockKiloCodeDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          profile: expect.objectContaining({
            baseUrl: "https://sharedchat.example.invalid/v1",
            apiKey: "sk-service-credential",
          }),
        }),
      )
    })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToCliProxy",
      }),
    )
    await waitFor(() => {
      expect(mockCliProxyDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          account: expect.objectContaining({
            baseUrl: "https://sharedchat.example.invalid/v1",
          }),
          token: expect.objectContaining({ key: "sk-service-credential" }),
        }),
      )
    })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToClaudeCodeRouter",
      }),
    )
    await waitFor(() => {
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
    })

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    )
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

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    )
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

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToCliProxy",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.importToClaudeCodeRouter",
      }),
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
