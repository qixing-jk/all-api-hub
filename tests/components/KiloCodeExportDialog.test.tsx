import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildKiloCodeCreateTokenToastId,
  KiloCodeExportDialog,
} from "~/components/KiloCodeExportDialog"
import { pickNewestKiloCodeToken } from "~/components/kiloCodeTokenSelection"
import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const mockUseAccountData = vi.fn()
const {
  toastSuccessMock,
  toastErrorMock,
  addTokenDialogPropsMock,
  completeProductAnalyticsActionMock,
  startProductAnalyticsActionMock,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  addTokenDialogPropsMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

vi.mock("~/hooks/useAccountData", () => ({
  useAccountData: () => mockUseAccountData(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

vi.mock("~/features/KeyManagement/components/AddTokenDialog", () => ({
  default: (props: {
    isOpen: boolean
    prefillNotice?: string
    createPrefill?: Record<string, unknown>
    onSuccess?: () => void | Promise<void>
    onClose?: () => void
  }) => {
    addTokenDialogPropsMock(props)

    if (!props.isOpen) return null

    return (
      <div data-testid="mock-add-token-dialog">
        {props.prefillNotice ? <div>{props.prefillNotice}</div> : null}
        <button type="button" onClick={() => props.onSuccess?.()}>
          mock-add-token-success
        </button>
        <button type="button" onClick={() => props.onClose?.()}>
          mock-add-token-close
        </button>
      </div>
    )
  },
}))

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  // Forward through a typed wrapper so call sites avoid `any[]`.
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

const mockFetchAccountTokens = vi.fn()
const mockGetSiteAdapter = vi.fn()
const mockResolveApiTokenKey = vi.fn()
const mockFetchAccountAvailableModels = vi.fn()
const mockFetchUserGroups = vi.fn()
const mockEnsureAccountApiToken = vi.fn()
const mockResolveDefaultTokenQuickCreateResolution = vi.fn()

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: (...args: unknown[]) => mockGetSiteAdapter(...args),
}))

vi.mock("~/services/accounts/accountOperations", () => ({
  ensureAccountApiToken: (...args: unknown[]) =>
    mockEnsureAccountApiToken(...args),
  resolveDefaultTokenQuickCreateResolution: (...args: unknown[]) =>
    mockResolveDefaultTokenQuickCreateResolution(...args),
}))

const createDisplayAccount = (
  overrides: Partial<DisplaySiteData>,
): DisplaySiteData => ({
  id: "account",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.UNKNOWN,
  baseUrl: "https://example.com",
  token: "access-token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

const createSiteAccount = (site: DisplaySiteData): SiteAccount => ({
  id: site.id,
  site_name: site.name,
  site_url: site.baseUrl,
  site_type: site.siteType,
  exchange_rate: 7,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  excludeFromTodayIncome: false,
  checkIn: { enableDetection: false },
  health: { status: SiteHealthStatus.Healthy },
  authType: site.authType,
  account_info: {
    id: site.userId,
    access_token: site.token,
    username: site.username,
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  last_sync_time: 0,
  created_at: 0,
  updated_at: 0,
  user_updated_at: 0,
})

const createApiToken = (
  overrides: Partial<ApiToken> & {
    id: number
    key: string
    name: string
    createdAt?: number | string
    created_at?: number | string
  },
): ApiToken =>
  ({
    user_id: 1,
    status: 1,
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: true,
    used_quota: 0,
    ...overrides,
  }) as ApiToken

const expectKiloAccountExportActionStarted = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
) => {
  expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
    actionId,
    surfaceId:
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountTokenKiloCodeExportDialog,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

describe("KiloCodeExportDialog", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    addTokenDialogPropsMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue(["gpt-4o-mini"])
    mockFetchAccountTokens.mockReset()
    mockGetSiteAdapter.mockReset()
    mockGetSiteAdapter.mockReturnValue({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => mockFetchAccountTokens(...args),
        createToken: vi.fn(),
        resolveTokenKey: (...args: unknown[]) =>
          mockResolveApiTokenKey(...args),
        deleteToken: vi.fn(),
        fetchUserGroups: (...args: unknown[]) => mockFetchUserGroups(...args),
        fetchAvailableModels: (...args: unknown[]) =>
          mockFetchAccountAvailableModels(...args),
      },
    })
    mockResolveApiTokenKey.mockReset()
    mockResolveApiTokenKey.mockImplementation(
      async (
        requestOrPayload: unknown | { token?: { key: string } },
        token?: { key: string },
      ) => {
        if (
          requestOrPayload &&
          typeof requestOrPayload === "object" &&
          "token" in requestOrPayload
        ) {
          return (requestOrPayload as { token: { key: string } }).token.key
        }

        return token?.key
      },
    )
    mockFetchAccountAvailableModels.mockReset()
    mockFetchAccountAvailableModels.mockResolvedValue([])
    mockFetchUserGroups.mockReset()
    mockFetchUserGroups.mockResolvedValue({})
    mockEnsureAccountApiToken.mockReset()
    mockResolveDefaultTokenQuickCreateResolution.mockReset()
  })

  it("auto loads tokens after selecting sites and enables export actions", async () => {
    const user = userEvent.setup()

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    render(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

    expect(
      await screen.findByText("ui:dialog.kiloCode.help.perSiteTitle"),
    ).toBeInTheDocument()

    expect(
      await screen.findByText("ui:dialog.kiloCode.help.afterExportTitle"),
    ).toBeInTheDocument()

    expect(
      await screen.findByText("ui:dialog.kiloCode.help.manualTitle"),
    ).toBeInTheDocument()

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyApiConfigs",
      }),
    ).toBeDisabled()

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: "1", name: "Default", key: "sk-test" },
    ])

    const sitePicker = await screen.findByPlaceholderText(
      "ui:dialog.kiloCode.placeholders.selectSites",
    )
    await user.click(sitePicker)
    await user.clear(sitePicker)
    await user.type(sitePicker, "Site B")
    await user.keyboard("{ArrowDown}")
    await user.click(await screen.findByRole("option", { name: "Site B" }))

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "b", baseUrl: "https://b.test" }),
      )
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.copyApiConfigs",
        }),
      ).not.toBeDisabled()
    })
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadSettings",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadSettings",
      }),
    ).not.toBeDisabled()

    await user.click(
      screen.getByRole("button", { name: "common:actions.refresh" }),
    )

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledTimes(2)
    })
  })

  it("disables export actions when there is nothing exportable", async () => {
    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [],
    })

    render(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyApiConfigs",
      }),
    ).toBeDisabled()
    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadSettings",
      }),
    ).toBeDisabled()
    expect(
      await screen.findByText(
        "ui:dialog.kiloCode.messages.nothingToExportTitle",
      ),
    ).toBeInTheDocument()
  })

  it("disables export actions when selected keys are missing a model id", async () => {
    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([])

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-test" },
    ])

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyApiConfigs",
    })
    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadSettings",
    })

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "b", baseUrl: "https://b.test" }),
      )
    })

    expect(copyButton).toBeDisabled()
    expect(downloadButton).toBeDisabled()
    expect(
      await screen.findByText(
        "ui:dialog.kiloCode.messages.modelIdRequiredTitle",
      ),
    ).toBeInTheDocument()
  })

  it("keeps token-load failures isolated per site", async () => {
    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "a",
          name: "Site A",
          baseUrl: "https://a.test",
        }),
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    mockFetchAccountTokens.mockImplementation(
      async (args: { accountId: string }) => {
        if (args.accountId === "a") {
          throw new Error("network error")
        }
        return [{ id: 1, name: "Default", key: "sk-test" }]
      },
    )

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["a", "b"]}
      />,
    )

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyApiConfigs",
    })
    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadSettings",
    })

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalled()
    })

    expect(
      await screen.findByText("ui:dialog.kiloCode.messages.loadTokensFailed"),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(copyButton).not.toBeDisabled()
      expect(downloadButton).not.toBeDisabled()
    })
  })

  it("recovers from a malformed token response after the user retries loading tokens", async () => {
    const user = userEvent.setup()

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    mockFetchAccountTokens
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce([{ id: 1, name: "Recovered", key: "sk-test" }])

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    expect(
      await screen.findByText("ui:dialog.kiloCode.messages.loadTokensFailed"),
    ).toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", { name: "common:actions.retry" }),
    )

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.copyApiConfigs",
        }),
      ).not.toBeDisabled()
    })
  })

  it("shows model-load failure feedback and retries loading models for the selected token", async () => {
    const user = userEvent.setup()

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-test" },
    ])
    mockFetchOpenAICompatibleModelIds
      .mockRejectedValueOnce(new Error("model load failed"))
      .mockResolvedValueOnce(["gpt-4o-mini"])

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    const errorText = await screen.findByText(
      "ui:dialog.kiloCode.messages.loadModelsFailed",
    )
    expect(errorText).toBeInTheDocument()

    const tokenSection = errorText.closest(".space-y-1")
    expect(tokenSection).toBeInstanceOf(HTMLElement)
    if (!(tokenSection instanceof HTMLElement)) {
      throw new Error("Expected token retry section to be an HTMLElement")
    }

    await user.click(
      within(tokenSection).getByRole("button", {
        name: "common:actions.retry",
      }),
    )

    await waitFor(() => {
      expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.copyApiConfigs",
        }),
      ).not.toBeDisabled()
    })
  })

  it("preselects sites/tokens when initial selections are provided", async () => {
    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-test" },
    ])

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
        initialSelectedTokenIdsBySite={{ b: ["1"] }}
      />,
    )

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "b", baseUrl: "https://b.test" }),
      )
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.copyApiConfigs",
        }),
      ).not.toBeDisabled()
    })
  })

  it("reapplies initial selections after the dialog closes and reopens from a different entry point", async () => {
    const accountA = createDisplayAccount({
      id: "a",
      name: "Site A",
      baseUrl: "https://a.test",
    })
    const accountB = createDisplayAccount({
      id: "b",
      name: "Site B",
      baseUrl: "https://b.test",
    })

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [accountA, accountB],
    })

    mockFetchAccountTokens
      .mockResolvedValueOnce([{ id: 1, name: "Token A", key: "sk-a" }])
      .mockResolvedValueOnce([{ id: 2, name: "Token B", key: "sk-b" }])

    const { rerender } = render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["a"]}
        initialSelectedTokenIdsBySite={{ a: ["1"] }}
      />,
    )

    expect((await screen.findAllByText("Site A")).length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "a", baseUrl: "https://a.test" }),
      )
    })

    rerender(
      <KiloCodeExportDialog
        isOpen={false}
        onClose={() => {}}
        initialSelectedSiteIds={["a"]}
        initialSelectedTokenIdsBySite={{ a: ["1"] }}
      />,
    )

    rerender(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
        initialSelectedTokenIdsBySite={{ b: ["2"] }}
      />,
    )

    expect((await screen.findAllByText("Site B")).length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "b", baseUrl: "https://b.test" }),
      )
    })

    expect(screen.queryAllByText("Site A")).toHaveLength(0)

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.copyApiConfigs",
        }),
      ).toBeEnabled()
    })
  })

  it("prunes stale selected sites when live account data no longer includes them", async () => {
    const site = createDisplayAccount({
      id: "b",
      name: "Site B",
      baseUrl: "https://b.test",
    })
    let currentAccountData = {
      enabledAccounts: [],
      enabledDisplayData: [site],
    }

    mockUseAccountData.mockImplementation(() => currentAccountData)

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-test" },
    ])

    const { rerender } = render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
        initialSelectedTokenIdsBySite={{ b: ["1"] }}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "ui:dialog.kiloCode.actions.copyApiConfigs",
        }),
      ).toBeEnabled()
    })

    currentAccountData = {
      enabledAccounts: [],
      enabledDisplayData: [],
    }

    rerender(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.queryByText("Site B")).not.toBeInTheDocument()
    })

    expect(
      screen.getByText("ui:dialog.kiloCode.messages.nothingToExportTitle"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyApiConfigs",
      }),
    ).toBeDisabled()
  })

  it("shows hostname and token fallback labels when site or token names are blank", async () => {
    const site = createDisplayAccount({
      id: "b",
      name: "   ",
      baseUrl: "https://fallback.example.com/openai/v1",
    })

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [site],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 7, name: "   ", key: "sk-test" },
    ])

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    expect(
      (await screen.findAllByText("fallback.example.com")).length,
    ).toBeGreaterThan(0)
    expect(
      (await screen.findAllByText("common:labels.token #7")).length,
    ).toBeGreaterThan(0)
  })

  it("uses the resolved single Sub2API group when creating a token for export", async () => {
    const user = userEvent.setup()
    const site = createDisplayAccount({
      id: "b",
      name: "Site B",
      baseUrl: "https://b.test",
      siteType: "sub2api",
    })

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [createSiteAccount(site)],
      enabledDisplayData: [site],
    })

    mockFetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 11, name: "Created", key: "sk-test" }])
    const policyTokenData = {
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      remain_quota: 45678,
      expired_time: -1,
      unlimited_quota: false,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "vip",
    }

    mockResolveDefaultTokenQuickCreateResolution.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: policyTokenData,
    })
    mockEnsureAccountApiToken.mockResolvedValueOnce({
      id: 11,
      name: "Created",
      key: "sk-test",
    })

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "b", baseUrl: "https://b.test" }),
      )
    })

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    await waitFor(() => {
      expect(mockResolveDefaultTokenQuickCreateResolution).toHaveBeenCalledWith(
        expect.objectContaining({ id: "b", siteType: "sub2api" }),
      )
      expect(mockEnsureAccountApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: "b", site_type: "sub2api" }),
        expect.objectContaining({ id: "b", siteType: "sub2api" }),
        expect.objectContaining({
          toastId: buildKiloCodeCreateTokenToastId("b"),
          defaultTokenData: policyTokenData,
        }),
      )
    })
  })

  it("opens the constrained Sub2API dialog when multiple groups are available", async () => {
    const user = userEvent.setup()
    const site = createDisplayAccount({
      id: "b",
      name: "Site B",
      baseUrl: "https://b.test",
      siteType: "sub2api",
    })

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [createSiteAccount(site)],
      enabledDisplayData: [site],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([])
    mockResolveDefaultTokenQuickCreateResolution.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
    })
    mockFetchUserGroups.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "b", baseUrl: "https://b.test" }),
      )
    })

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    expect(mockEnsureAccountApiToken).not.toHaveBeenCalled()
    expect(
      await screen.findByText(
        "messages:tokenProvisioning.createRequiresGroupSelection",
      ),
    ).toBeInTheDocument()
    expect(addTokenDialogPropsMock).toHaveBeenCalled()

    const latestDialogProps = addTokenDialogPropsMock.mock.lastCall?.[0]
    expect(latestDialogProps?.createPrefill).toMatchObject({
      modelId: "",
      defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      group: "default",
      allowedGroups: ["default", "vip"],
    })

    await user.click(
      await screen.findByRole("button", { name: "mock-add-token-close" }),
    )
    expect(
      screen.queryByTestId("mock-add-token-dialog"),
    ).not.toBeInTheDocument()
  })

  it("uses the newest created token after constrained Sub2API creation regardless of fetch order", async () => {
    const user = userEvent.setup()
    const site = createDisplayAccount({
      id: "b",
      name: "Site B",
      baseUrl: "https://b.test",
      siteType: "sub2api",
    })

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [createSiteAccount(site)],
      enabledDisplayData: [site],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 11,
        name: "Newest",
        key: "sk-newest",
        created_time: 200,
      },
      {
        id: 22,
        name: "Older",
        key: "sk-older",
        created_time: 100,
      },
    ])
    mockResolveDefaultTokenQuickCreateResolution.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
    })

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    await user.click(
      await screen.findByRole("button", { name: "mock-add-token-success" }),
    )

    await waitFor(() => {
      expect(
        screen.getByTitle("ui:dialog.kiloCode.labels.selectedTokens"),
      ).toHaveTextContent("1/2")
    })
    expect(screen.getAllByText("Newest").length).toBeGreaterThan(0)
    expect(screen.queryByText("Older")).not.toBeInTheDocument()
  })

  it("selects the newest refreshed token when upstream creation timestamps arrive as strings or ISO dates", async () => {
    expect(
      pickNewestKiloCodeToken([
        createApiToken({
          id: 11,
          name: "Numeric String",
          key: "sk-older",
          createdAt: "1711929600000",
        }),
        createApiToken({
          id: 22,
          name: "ISO Newest",
          key: "sk-newest",
          created_at: "2024-04-02T00:00:00.000Z",
        }),
        createApiToken({
          id: 15,
          name: "ISO Older",
          key: "sk-oldest",
          created_at: "2024-04-01T00:00:00.000Z",
        }),
      ]),
    ).toEqual(
      createApiToken({
        id: 22,
        name: "ISO Newest",
        key: "sk-newest",
        created_at: "2024-04-02T00:00:00.000Z",
      }),
    )
  })

  it("falls back to the highest token id when refreshed tokens have unusable creation timestamps", async () => {
    expect(
      pickNewestKiloCodeToken([
        createApiToken({
          id: 11,
          name: "Invalid Timestamp",
          key: "sk-older",
          createdAt: "not-a-timestamp",
        }),
        createApiToken({
          id: 22,
          name: "Higher Id",
          key: "sk-newest",
        }),
      ]),
    ).toEqual(
      createApiToken({
        id: 22,
        name: "Higher Id",
        key: "sk-newest",
      }),
    )
  })

  it("throws a clear invariant error when selecting from an empty refreshed token list", () => {
    expect(() => pickNewestKiloCodeToken([])).toThrow(
      "Expected at least one Kilo Code token to select",
    )
  })

  it("falls back to a user-friendly blocked Sub2API create message when the resolution message is blank", async () => {
    const user = userEvent.setup()
    const site = createDisplayAccount({
      id: "b",
      name: "Site B",
      baseUrl: "https://b.test",
      siteType: "sub2api",
    })

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [createSiteAccount(site)],
      enabledDisplayData: [site],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([])
    mockResolveDefaultTokenQuickCreateResolution.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
      message: "   ",
    })

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    const fallbackMessage =
      "ui:dialog.kiloCode.messages.createTokenBlockedFallback"

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(fallbackMessage, {
        id: buildKiloCodeCreateTokenToastId("b"),
      })
    })
    expect(await screen.findByText(fallbackMessage)).toBeInTheDocument()
  })

  it("uses the blocked Sub2API create message when one is available", async () => {
    const user = userEvent.setup()
    const site = createDisplayAccount({
      id: "b",
      name: "Site B",
      baseUrl: "https://b.test",
      siteType: "sub2api",
    })

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [createSiteAccount(site)],
      enabledDisplayData: [site],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([])
    mockResolveDefaultTokenQuickCreateResolution.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked,
      message: "Policy blocked",
    })

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("Policy blocked", {
        id: buildKiloCodeCreateTokenToastId("b"),
      })
    })
    expect(await screen.findByText("Policy blocked")).toBeInTheDocument()
  })

  it("shows accountNotFound feedback when token creation is requested without a backing account", async () => {
    const user = userEvent.setup()
    const site = createDisplayAccount({
      id: "b",
      name: "Site B",
      baseUrl: "https://b.test",
      siteType: "sub2api",
    })

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [site],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([])

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "ui:dialog.kiloCode.messages.accountNotFound",
      )
    })
    expect(mockEnsureAccountApiToken).not.toHaveBeenCalled()
  })

  it("copies export configs with resolved full keys instead of masked inventory values", async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-abcd************wxyz" },
    ])
    mockResolveApiTokenKey.mockResolvedValue("sk-full-secret")

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyApiConfigs",
    })
    await waitFor(() => expect(copyButton).toBeEnabled())

    await user.click(copyButton)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
    })

    const copiedPayload = String(writeText.mock.calls[0]?.[0] ?? "")
    expect(copiedPayload).toContain("sk-full-secret")
    expect(copiedPayload).not.toContain("sk-abcd************wxyz")
    expectKiloAccountExportActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.CopyKiloCodeAccountExportConfig,
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      { insights: { itemCount: 1, modelCount: 1, selectedCount: 1 } },
    )
  })

  it("shows resolver error feedback when resolving export secrets throws", async () => {
    const user = userEvent.setup()

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-abcd************wxyz" },
    ])
    mockResolveApiTokenKey.mockImplementation(
      async (
        requestOrPayload: unknown | { token?: { key: string } },
        token?: { key: string },
      ) => {
        if (
          requestOrPayload &&
          typeof requestOrPayload === "object" &&
          "token" in requestOrPayload
        ) {
          return (requestOrPayload as { token: { key: string } }).token.key
        }

        return token?.key
      },
    )

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyApiConfigs",
    })
    await waitFor(() => expect(copyButton).toBeEnabled())

    mockResolveApiTokenKey.mockRejectedValueOnce(new Error("resolve failed"))
    await user.click(copyButton)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("resolve failed")
    })
    expectKiloAccountExportActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.CopyKiloCodeAccountExportConfig,
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: { itemCount: 1, modelCount: 1, selectedCount: 1 },
      },
    )
  })

  it("downloads settings with resolved full keys and cleans up the blob URL", async () => {
    const user = userEvent.setup()
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:kilo-code-settings")
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {})
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {})

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-abcd************wxyz" },
    ])
    mockResolveApiTokenKey.mockResolvedValue("sk-full-secret")

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadSettings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    await user.click(downloadButton)

    await waitFor(() => {
      expect(createObjectUrl).toHaveBeenCalledTimes(1)
    })

    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob
    const payload = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ""))
      reader.onerror = () =>
        reject(reader.error ?? new Error("failed to read blob"))
      reader.readAsText(blob)
    })

    expect(payload).toContain("sk-full-secret")
    expect(payload).not.toContain("sk-abcd************wxyz")
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:kilo-code-settings")
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.kiloCode.messages.downloadedSettings",
    )
    expectKiloAccountExportActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.ExportKiloCodeAccountSettingsFile,
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      { insights: { itemCount: 1, modelCount: 1, selectedCount: 1 } },
    )

    clickSpy.mockRestore()
    revokeObjectUrl.mockRestore()
    createObjectUrl.mockRestore()
  })

  it("tracks download completion failure when resolving export secrets throws", async () => {
    const user = userEvent.setup()

    mockUseAccountData.mockReturnValue({
      enabledAccounts: [],
      enabledDisplayData: [
        createDisplayAccount({
          id: "b",
          name: "Site B",
          baseUrl: "https://b.test",
        }),
      ],
    })

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-abcd************wxyz" },
    ])
    mockResolveApiTokenKey
      .mockResolvedValueOnce("sk-full-secret")
      .mockRejectedValueOnce(new Error("resolve failed"))

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadSettings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    await user.click(downloadButton)

    expectKiloAccountExportActionStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.ExportKiloCodeAccountSettingsFile,
    )
    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: { itemCount: 1, modelCount: 1, selectedCount: 1 },
        },
      )
    })
  })
})
