import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import ManagedSiteTab from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteTab"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import zhCNSettings from "~/locales/zh-CN/settings.json"
import { render, screen, within } from "~~/tests/test-utils/render"

const {
  mockedGetAllAccounts,
  mockedConvertToDisplayData,
  mockedPushWithinOptionsPage,
  mockedUseUserPreferencesContext,
} = vi.hoisted(() => ({
  mockedGetAllAccounts: vi.fn(),
  mockedConvertToDisplayData: vi.fn(),
  mockedPushWithinOptionsPage: vi.fn(),
  mockedUseUserPreferencesContext: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: mockedGetAllAccounts },
}))
vi.mock("~/services/accounts/accountStorage/accountPresentation", () => ({
  accountPresentation: { convertToDisplayData: mockedConvertToDisplayData },
}))

vi.mock("~/services/accounts/keyProductCapabilities", () => ({
  canResolveAccountRuntimeKeySecret: (account: { id?: string }) =>
    account.id === "account-1",
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
  }
})

vi.mock(
  "~/features/BasicSettings/components/tabs/ManagedSite/managedSiteModelSyncSettings",
  () => ({
    default: () => <div data-testid="managed-site-model-sync-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/ManagedSite/ModelRedirectSettings",
  () => ({
    default: () => <div data-testid="model-redirect-settings" />,
  }),
)

vi.mock("~/components/icons/optionsPageIcons", () => {
  const createIcon =
    (testId: string) =>
    ({ className }: { className?: string }) => (
      <svg aria-hidden="true" className={className} data-testid={testId} />
    )

  return {
    OPTIONS_MENU_ITEM_ICONS: {
      keys: createIcon("sidebar-icon-keys"),
      apiCredentialProfiles: createIcon("sidebar-icon-api-credential-profiles"),
      managedSiteChannels: createIcon("sidebar-icon-managed-site-channels"),
    },
  }
})

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("~/utils/navigation")

  return {
    ...actual,
    pushWithinOptionsPage: mockedPushWithinOptionsPage,
  }
})

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  preferences: { lastUpdated: 1 },
  managedSiteType: "new-api",
  updateManagedSiteType: vi.fn().mockResolvedValue(true),
  newApiBaseUrl: "https://managed.example",
  newApiAdminToken: "managed-admin-token",
  newApiUserId: "1",
  newApiUsername: "admin",
  newApiPassword: "secret-password",
  newApiTotpSecret: "JBSWY3DPEHPK3PXP",
  updateNewApiBaseUrl: vi.fn().mockResolvedValue(true),
  updateNewApiAdminToken: vi.fn().mockResolvedValue(true),
  updateNewApiUserId: vi.fn().mockResolvedValue(true),
  updateNewApiUsername: vi.fn().mockResolvedValue(true),
  updateNewApiPassword: vi.fn().mockResolvedValue(true),
  updateNewApiTotpSecret: vi.fn().mockResolvedValue(true),
  resetNewApiConfig: vi.fn().mockResolvedValue(true),
  claudeCodeHubBaseUrl: "https://cch.example",
  claudeCodeHubAdminToken: "admin-token",
  updateClaudeCodeHubBaseUrl: vi.fn().mockResolvedValue(true),
  updateClaudeCodeHubAdminToken: vi.fn().mockResolvedValue(true),
  updateClaudeCodeHubConfig: vi.fn().mockResolvedValue(true),
  resetClaudeCodeHubConfig: vi.fn().mockResolvedValue(true),
  ...overrides,
})

describe("ManagedSiteTab", () => {
  beforeEach(() => {
    mockedGetAllAccounts.mockReset()
    mockedGetAllAccounts.mockResolvedValue([])
    mockedConvertToDisplayData.mockReset()
    mockedConvertToDisplayData.mockReturnValue([])
    mockedPushWithinOptionsPage.mockReset()
    mockedUseUserPreferencesContext.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("explains the external gateway role before the managed site is configured", () => {
    render(<ManagedSiteTab />)

    expect(
      screen.getByText(
        "settings:managedSite.gatewayGuidance.unconfigured.title",
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "settings:managedSite.gatewayGuidance.unconfigured.description",
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "settings:managedSite.gatewayGuidance.actions.importAccountKeys",
      }),
    ).not.toBeInTheDocument()
  })

  it("offers channel setup next steps when the managed site config is complete", () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          lastUpdated: 1,
          managedSiteType: SITE_TYPES.NEW_API,
          newApi: {
            baseUrl: "https://managed.example.invalid",
            adminToken: "managed-admin-token",
            userId: "1",
          },
        },
      }),
    )

    render(<ManagedSiteTab />)

    expect(
      screen.getByText(
        "settings:managedSite.gatewayGuidance.configComplete.title",
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "settings:managedSite.gatewayGuidance.configComplete.description",
      ),
    ).toBeVisible()
    const accountKeyAction = screen.getByRole("button", {
      name: "settings:managedSite.gatewayGuidance.actions.importAccountKeys",
    })
    expect(accountKeyAction).toBeVisible()
    expect(
      within(accountKeyAction).getByTestId("sidebar-icon-keys"),
    ).toBeInTheDocument()
    expect(accountKeyAction).not.toHaveClass("border")
    expect(
      screen.queryByText(
        "settings:managedSite.gatewayGuidance.actionDescriptions.importAccountKeys",
      ),
    ).not.toBeInTheDocument()
    const apiKeyAction = screen.getByRole("button", {
      name: "settings:managedSite.gatewayGuidance.actions.importApiKeys",
    })
    expect(apiKeyAction).toBeVisible()
    expect(
      within(apiKeyAction).getByTestId("sidebar-icon-api-credential-profiles"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "settings:managedSite.gatewayGuidance.actionDescriptions.importApiKeys",
      ),
    ).not.toBeInTheDocument()
    const channelsAction = screen.getByRole("button", {
      name: "settings:managedSite.gatewayGuidance.actions.viewChannels",
    })
    expect(channelsAction).toBeVisible()
    expect(
      within(channelsAction).getByTestId("sidebar-icon-managed-site-channels"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "settings:managedSite.gatewayGuidance.actionDescriptions.viewChannels",
      ),
    ).not.toBeInTheDocument()
  })

  it("keeps the zh-CN guidance explicit about channel prerequisites", () => {
    const { configComplete, unconfigured } =
      zhCNSettings.managedSite.gatewayGuidance

    expect(configComplete.title).toBe("下一步：导入可用 Key")
    expect(configComplete.description).toContain("基础配置只完成了网关后台连接")
    expect(configComplete.description).toContain("导入为网关渠道")
    expect(configComplete.description).toContain("统一 AI API")
    expect(configComplete.description).toContain("外部客户端")
    expect(`${configComplete.title}${configComplete.description}`).not.toMatch(
      /网关已就绪|连接已就绪/,
    )
    expect(unconfigured.description).toContain("完成自建 AI 网关配置")
    expect(unconfigured.description).toContain("导入为网关渠道")
    expect(unconfigured.description).toContain("同一个 AI API")
  })

  it("opens guided account-key import for an eligible account", async () => {
    const user = userEvent.setup()
    mockedGetAllAccounts.mockResolvedValue([{ id: "account-1" }])
    mockedConvertToDisplayData.mockReturnValue([
      { id: "account-1", siteType: SITE_TYPES.NEW_API },
    ])
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          lastUpdated: 1,
          managedSiteType: SITE_TYPES.NEW_API,
          newApi: {
            baseUrl: "https://managed.example.invalid",
            adminToken: "managed-admin-token",
            userId: "1",
          },
        },
      }),
    )
    render(<ManagedSiteTab />)

    await user.click(
      await screen.findByRole("button", {
        name: "settings:managedSite.gatewayGuidance.actions.importAccountKeys",
      }),
    )

    expect(mockedPushWithinOptionsPage).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.KEYS}`,
      {
        accountId: "account-1",
        [KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]:
          KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
      },
    )
  })

  it("opens guided account-key import without preselection when account inventory is unavailable", async () => {
    const user = userEvent.setup()
    mockedGetAllAccounts.mockRejectedValueOnce(
      new Error("account inventory unavailable"),
    )
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          lastUpdated: 1,
          managedSiteType: SITE_TYPES.NEW_API,
          newApi: {
            baseUrl: "https://managed.example.invalid",
            adminToken: "managed-admin-token",
            userId: "1",
          },
        },
      }),
    )
    render(<ManagedSiteTab />)

    await user.click(
      await screen.findByRole("button", {
        name: "settings:managedSite.gatewayGuidance.actions.importAccountKeys",
      }),
    )

    expect(mockedPushWithinOptionsPage).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.KEYS}`,
      {
        [KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]:
          KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
      },
    )
  })

  it("opens the API credential import teaching entry", async () => {
    const user = userEvent.setup()
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          lastUpdated: 1,
          managedSiteType: SITE_TYPES.NEW_API,
          newApi: {
            baseUrl: "https://managed.example.invalid",
            adminToken: "managed-admin-token",
            userId: "1",
          },
        },
      }),
    )
    render(<ManagedSiteTab />)

    await user.click(
      screen.getByRole("button", {
        name: "settings:managedSite.gatewayGuidance.actions.importApiKeys",
      }),
    )

    expect(mockedPushWithinOptionsPage).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
      {
        [KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]:
          KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
      },
    )
  })

  it("keeps channel navigation as a plain page link", async () => {
    const user = userEvent.setup()
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        preferences: {
          lastUpdated: 1,
          managedSiteType: SITE_TYPES.NEW_API,
          newApi: {
            baseUrl: "https://managed.example.invalid",
            adminToken: "managed-admin-token",
            userId: "1",
          },
        },
      }),
    )
    render(<ManagedSiteTab />)

    await user.click(
      screen.getByRole("button", {
        name: "settings:managedSite.gatewayGuidance.actions.viewChannels",
      }),
    )

    expect(mockedPushWithinOptionsPage).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
    )
  })

  it("renders the New API login-assist fields when new-api is the active managed site", () => {
    render(<ManagedSiteTab />)

    expect(
      screen.getByPlaceholderText("settings:newApi.fields.usernamePlaceholder"),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText("settings:newApi.fields.passwordPlaceholder"),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(
        "settings:newApi.fields.totpSecretPlaceholder",
      ),
    ).toBeInTheDocument()
  })

  it("does not render the New API login-assist fields when the managed site is not new-api", () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        managedSiteType: SITE_TYPES.VELOERA,
        veloeraBaseUrl: "",
        veloeraAdminToken: "",
        veloeraUserId: "",
        updateVeloeraBaseUrl: vi.fn().mockResolvedValue(true),
        updateVeloeraAdminToken: vi.fn().mockResolvedValue(true),
        updateVeloeraUserId: vi.fn().mockResolvedValue(true),
        resetVeloeraConfig: vi.fn().mockResolvedValue(true),
      }),
    )

    render(<ManagedSiteTab />)

    expect(
      screen.getByPlaceholderText("settings:veloera.fields.baseUrlPlaceholder"),
    ).toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText(
        "settings:newApi.fields.usernamePlaceholder",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText(
        "settings:newApi.fields.passwordPlaceholder",
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText(
        "settings:newApi.fields.totpSecretPlaceholder",
      ),
    ).not.toBeInTheDocument()
  })

  it("hides model-sync and redirect settings for AxonHub", () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        managedSiteType: SITE_TYPES.AXON_HUB,
        axonHubBaseUrl: "https://axonhub.example",
        axonHubEmail: "admin@example.com",
        axonHubPassword: "secret-password",
        updateAxonHubBaseUrl: vi.fn().mockResolvedValue(true),
        updateAxonHubEmail: vi.fn().mockResolvedValue(true),
        updateAxonHubPassword: vi.fn().mockResolvedValue(true),
        updateAxonHubConfig: vi.fn().mockResolvedValue(true),
        resetAxonHubConfig: vi.fn().mockResolvedValue(true),
      }),
    )

    render(<ManagedSiteTab />)

    expect(
      screen.queryByTestId("managed-site-model-sync-settings"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("model-redirect-settings"),
    ).not.toBeInTheDocument()
  })

  it("renders Claude Code Hub settings and hides unsupported model controls", () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      }),
    )

    render(<ManagedSiteTab />)

    expect(
      screen.getByPlaceholderText(
        "settings:claudeCodeHub.fields.baseUrlPlaceholder",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(
        "settings:claudeCodeHub.fields.adminTokenPlaceholder",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("managed-site-model-sync-settings"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("model-redirect-settings"),
    ).not.toBeInTheDocument()
  })

  it("renders Sub2API settings and hides unsupported model controls", () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        managedSiteType: SITE_TYPES.SUB2API,
        sub2ApiManagedSiteBaseUrl: "https://sub2api.example.invalid",
        sub2ApiManagedSiteAdminToken: "admin-key",
        updateSub2ApiManagedSiteBaseUrl: vi.fn().mockResolvedValue(true),
        updateSub2ApiManagedSiteAdminToken: vi.fn().mockResolvedValue(true),
        updateSub2ApiManagedSiteConfig: vi.fn().mockResolvedValue(true),
        resetSub2ApiManagedSiteConfig: vi.fn().mockResolvedValue(true),
      }),
    )

    render(<ManagedSiteTab />)

    expect(
      screen.getByPlaceholderText(
        "settings:sub2apiManagedSite.fields.baseUrlPlaceholder",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(
        "settings:sub2apiManagedSite.fields.adminApiKeyPlaceholder",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId("managed-site-model-sync-settings"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("model-redirect-settings"),
    ).not.toBeInTheDocument()
  })

  it.each([
    [
      SITE_TYPES.DONE_HUB,
      {
        doneHubBaseUrl: "https://done-hub.example",
        doneHubAdminToken: "admin-token",
        doneHubUserId: "7",
        updateDoneHubBaseUrl: vi.fn().mockResolvedValue(true),
        updateDoneHubAdminToken: vi.fn().mockResolvedValue(true),
        updateDoneHubUserId: vi.fn().mockResolvedValue(true),
        resetDoneHubConfig: vi.fn().mockResolvedValue(true),
      },
      "settings:doneHub.fields.baseUrlPlaceholder",
    ],
    [
      SITE_TYPES.OCTOPUS,
      {
        octopusBaseUrl: "https://octopus.example",
        octopusUsername: "admin",
        octopusPassword: "secret-password",
        updateOctopusBaseUrl: vi.fn().mockResolvedValue(true),
        updateOctopusUsername: vi.fn().mockResolvedValue(true),
        updateOctopusPassword: vi.fn().mockResolvedValue(true),
        resetOctopusConfig: vi.fn().mockResolvedValue(true),
      },
      "settings:octopus.fields.baseUrlPlaceholder",
    ],
  ])(
    "renders %s settings with shared model controls",
    (managedSiteType, config, placeholder) => {
      mockedUseUserPreferencesContext.mockReturnValue(
        createContextValue({
          managedSiteType,
          ...config,
        }),
      )

      render(<ManagedSiteTab />)

      expect(screen.getByPlaceholderText(placeholder)).toBeInTheDocument()
      expect(
        screen.getByTestId("managed-site-model-sync-settings"),
      ).toBeInTheDocument()
      expect(screen.getByTestId("model-redirect-settings")).toBeInTheDocument()
    },
  )
})
