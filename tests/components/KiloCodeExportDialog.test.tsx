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
import { KILO_CODE_EXPORT_TARGETS } from "~/services/integrations/kiloCodeExport"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
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

vi.mock("~/features/TokenProvisioning/components/AddTokenDialog", () => ({
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
const mockBuildKiloCodeExportOutput = vi.fn()

vi.mock("~/services/integrations/kiloCodeExportPolicy", () => ({
  buildKiloCodeExportOutput: (...args: unknown[]) =>
    mockBuildKiloCodeExportOutput(...args),
}))

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  // Forward through a typed wrapper so call sites avoid `any[]`.
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

const mockFetchAccountTokens = vi.fn()
const mockgetSiteTypeCapabilities = vi.fn()
const mockResolveApiTokenKey = vi.fn()
const mockFetchAccountAvailableModels = vi.fn()
const mockFetchUserGroups = vi.fn()
const mockEnsureAccountApiToken = vi.fn()
const mockResolveDefaultTokenQuickCreateResolution = vi.fn()
const KILO_V7_GUIDANCE_KEYS = [
  "ui:dialog.kiloCode.help.kiloV7DownloadInstructions",
  "ui:dialog.kiloCode.help.kiloV7CopyInstructions",
] as const
const LEGACY_GUIDANCE_KEYS = [
  "ui:dialog.kiloCode.help.legacyDownloadInstructions",
  "ui:dialog.kiloCode.help.legacyCopyInstructions",
] as const

function expectUsageGuidance(
  instructionsKeys: readonly string[],
  oppositeTargetInstructionsKeys: readonly string[],
) {
  const usageAlert = screen
    .getByText("ui:dialog.kiloCode.help.usageTitle")
    .closest<HTMLElement>('[role="alert"]')!
  const securityAlert = screen
    .getByText("ui:dialog.kiloCode.warning.title")
    .closest<HTMLElement>('[role="alert"]')!

  const renderedInstructions = instructionsKeys.map((instructionsKey) => {
    const renderedInstruction = within(usageAlert).getByText(instructionsKey)
    expect(renderedInstruction).toBeVisible()
    return renderedInstruction
  })
  for (let index = 1; index < renderedInstructions.length; index += 1) {
    expect(
      renderedInstructions[index - 1].compareDocumentPosition(
        renderedInstructions[index],
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  }
  for (const instructionsKey of oppositeTargetInstructionsKeys) {
    expect(screen.queryByText(instructionsKey)).not.toBeInTheDocument()
  }
  expect(screen.getAllByRole("alert").indexOf(usageAlert)).toBeLessThan(
    screen.getAllByRole("alert").indexOf(securityAlert),
  )
  expect(
    screen.queryByText("ui:dialog.kiloCode.help.afterExportTitle"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("ui:dialog.kiloCode.help.manualTitle"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("ui:dialog.kiloCode.help.kiloV7Title"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("ui:dialog.kiloCode.help.legacyTitle"),
  ).not.toBeInTheDocument()
}

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: (...args: unknown[]) =>
    mockgetSiteTypeCapabilities(...args),
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
    mockBuildKiloCodeExportOutput.mockReset()
    mockBuildKiloCodeExportOutput.mockImplementation(
      ({ target, selections }: any) => ({
        filename:
          target === KILO_CODE_EXPORT_TARGETS.KiloV7
            ? "kilo-settings.json"
            : "kilo-code-settings.json",
        copyPayload: { target, selections },
        downloadPayload: { target, selections },
        itemCount: selections.length,
      }),
    )
    mockFetchAccountTokens.mockReset()
    mockgetSiteTypeCapabilities.mockReset()
    mockgetSiteTypeCapabilities.mockReturnValue({
      account: {
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

    await screen.findByText("ui:dialog.kiloCode.help.usageTitle")
    expectUsageGuidance(KILO_V7_GUIDANCE_KEYS, LEGACY_GUIDANCE_KEYS)

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
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
          name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
        }),
      ).not.toBeDisabled()
    })
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
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
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
      }),
    ).toBeDisabled()
    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
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
      name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
    })
    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
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
      name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
    })
    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
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
          name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
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
          name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
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
          name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
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
          name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
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
          name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
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
        name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
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
      name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
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
      {
        insights: {
          itemCount: 1,
          modelCount: 1,
          selectedCount: 1,
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
        },
      },
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
      name: "ui:dialog.kiloCode.actions.copyKiloV7Provider",
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
        insights: {
          itemCount: 1,
          modelCount: 1,
          selectedCount: 1,
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
        },
      },
    )
  })

  it("defaults to Kilo v7 and downloads policy output with resolved full keys", async () => {
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
    mockBuildKiloCodeExportOutput.mockReturnValueOnce({
      filename: "kilo-settings.json",
      copyPayload: { format: "v7-copy" },
      downloadPayload: { format: "v7-download" },
      itemCount: 1,
    })

    render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.exportTarget",
      }),
    ).toHaveTextContent("ui:dialog.kiloCode.targets.kiloV7")
    expect(
      screen.queryByText("ui:dialog.kiloCode.labels.currentApiConfigName"),
    ).not.toBeInTheDocument()
    expect(downloadButton).toHaveAccessibleName(
      "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
    )
    expectUsageGuidance(KILO_V7_GUIDANCE_KEYS, LEGACY_GUIDANCE_KEYS)
    expect(
      screen.queryByText("ui:dialog.kiloCode.help.kiloV7Description"),
    ).not.toBeInTheDocument()

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

    expect(mockBuildKiloCodeExportOutput).toHaveBeenCalledWith({
      target: KILO_CODE_EXPORT_TARGETS.KiloV7,
      selections: [expect.objectContaining({ tokenKey: "sk-full-secret" })],
      currentLegacyProfileName: expect.any(String),
    })
    expect(payload).toBe(JSON.stringify({ format: "v7-download" }, null, 2))
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
      {
        insights: {
          itemCount: 1,
          modelCount: 1,
          selectedCount: 1,
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
        },
      },
    )

    clickSpy.mockRestore()
    revokeObjectUrl.mockRestore()
    createObjectUrl.mockRestore()
  })

  it("switches to legacy policy output without refetching or resolving another secret", async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:legacy")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    let downloadedFilename = ""
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download
    })

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
      { id: 1, name: "Default", key: "sk-masked********" },
    ])
    mockResolveApiTokenKey.mockResolvedValue("sk-full-secret")

    const { rerender } = render(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )

    const targetSelect = await screen.findByRole("combobox", {
      name: "ui:dialog.kiloCode.labels.exportTarget",
    })
    const downloadButton = screen.getByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
    })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    const tokenFetchCount = mockFetchAccountTokens.mock.calls.length
    const modelFetchCount = mockFetchOpenAICompatibleModelIds.mock.calls.length
    mockResolveApiTokenKey.mockClear()

    await user.click(targetSelect)
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole("option", {
        name: "ui:dialog.kiloCode.targets.legacy",
      }),
    )

    expect(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyLegacyApiConfigs",
      }),
    ).toBeVisible()
    expect(downloadButton).toHaveAccessibleName(
      "ui:dialog.kiloCode.actions.downloadLegacySettings",
    )
    expectUsageGuidance(LEGACY_GUIDANCE_KEYS, KILO_V7_GUIDANCE_KEYS)
    expect(
      screen.getByText("ui:dialog.kiloCode.labels.currentApiConfigName"),
    ).toBeVisible()
    expect(
      screen.queryByText("ui:dialog.kiloCode.help.legacyDescription"),
    ).not.toBeInTheDocument()

    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(tokenFetchCount)
    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledTimes(
      modelFetchCount,
    )
    expect(mockResolveApiTokenKey).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("button", {
        name: "ui:dialog.kiloCode.actions.copyLegacyApiConfigs",
      }),
    )
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "ui:dialog.kiloCode.messages.copiedExportConfig",
    )
    expect(JSON.parse(String(writeText.mock.calls[0]?.[0]))).toEqual({
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      selections: [expect.objectContaining({ tokenKey: "sk-full-secret" })],
    })

    await user.click(downloadButton)
    await waitFor(() =>
      expect(downloadedFilename).toBe("kilo-code-settings.json"),
    )
    expect(mockBuildKiloCodeExportOutput).toHaveBeenLastCalledWith(
      expect.objectContaining({ target: KILO_CODE_EXPORT_TARGETS.Legacy }),
    )
    expect(mockResolveApiTokenKey).toHaveBeenCalledTimes(2)
    expect(completeProductAnalyticsActionMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: expect.objectContaining({
          kiloCodeExportTarget:
            PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.Legacy,
        }),
      },
    )

    const tokenFetchCountBeforeReopen = mockFetchAccountTokens.mock.calls.length
    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-masked********" },
    ])
    rerender(
      <KiloCodeExportDialog
        isOpen={false}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )
    rerender(
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => {}}
        initialSelectedSiteIds={["b"]}
      />,
    )
    await waitFor(() => {
      expect(mockFetchAccountTokens).toHaveBeenCalledTimes(
        tokenFetchCountBeforeReopen + 1,
      )
    })
    expect(
      screen.getByRole("combobox", {
        name: "ui:dialog.kiloCode.labels.exportTarget",
      }),
    ).toHaveTextContent("ui:dialog.kiloCode.targets.kiloV7")
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
      name: "ui:dialog.kiloCode.actions.downloadKiloV7Settings",
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
          insights: {
            itemCount: 1,
            modelCount: 1,
            selectedCount: 1,
            kiloCodeExportTarget:
              PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
          },
        },
      )
    })
  })
})
