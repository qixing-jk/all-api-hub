import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KiloCodeExportDialog } from "~/components/KiloCodeExportDialog"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mockUseAccountData = vi.fn()
const { toastSuccessMock, toastErrorMock, addTokenDialogPropsMock } =
  vi.hoisted(() => ({
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    addTokenDialogPropsMock: vi.fn(),
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

vi.mock("~/services/apiService/openaiCompatible", () => ({
  // Forward through a typed wrapper so call sites avoid `any[]`.
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

const mockFetchAccountTokens = vi.fn()
const mockGetApiService = vi.fn()
const mockResolveApiTokenKey = vi.fn()
const mockFetchAccountAvailableModels = vi.fn()
const mockFetchUserGroups = vi.fn()
const mockEnsureAccountApiToken = vi.fn()
const mockResolveSub2ApiQuickCreateResolution = vi.fn()

vi.mock("~/services/apiService", () => ({
  // Forward through a typed wrapper so call sites avoid `any[]`.
  getApiService: (...args: unknown[]) => mockGetApiService(...args),
}))

vi.mock("~/services/accounts/accountOperations", () => ({
  ensureAccountApiToken: (...args: unknown[]) =>
    mockEnsureAccountApiToken(...args),
  resolveSub2ApiQuickCreateResolution: (...args: unknown[]) =>
    mockResolveSub2ApiQuickCreateResolution(...args),
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
  siteType: "default",
  baseUrl: "https://example.com",
  token: "access-token",
  userId: 1,
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
})

describe("KiloCodeExportDialog", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    addTokenDialogPropsMock.mockReset()
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue(["gpt-4o-mini"])
    mockFetchAccountTokens.mockReset()
    mockGetApiService.mockReset()
    mockResolveApiTokenKey.mockReset()
    mockResolveApiTokenKey.mockImplementation(
      async (_request, token: { key: string }) => token.key,
    )
    mockFetchAccountAvailableModels.mockReset()
    mockFetchAccountAvailableModels.mockResolvedValue([])
    mockFetchUserGroups.mockReset()
    mockFetchUserGroups.mockResolvedValue({})
    mockEnsureAccountApiToken.mockReset()
    mockResolveSub2ApiQuickCreateResolution.mockReset()
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
      { id: 1, name: "Default", key: "sk-test" },
    ])
    mockGetApiService.mockReturnValue({
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
    })

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

    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([])

    mockFetchAccountTokens.mockResolvedValueOnce([
      { id: 1, name: "Default", key: "sk-test" },
    ])
    mockGetApiService.mockReturnValue({
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
    })

    render(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyApiConfigs",
    })
    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadSettings",
    })

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

    expect(copyButton).toBeDisabled()
    expect(downloadButton).toBeDisabled()
    expect(
      await screen.findByText(
        "ui:dialog.kiloCode.messages.modelIdRequiredTitle",
      ),
    ).toBeInTheDocument()
  })

  it("keeps token-load failures isolated per site", async () => {
    const user = userEvent.setup()

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
    mockGetApiService.mockReturnValue({
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
    })

    render(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyApiConfigs",
    })
    const downloadButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.downloadSettings",
    })

    expect(copyButton).toBeDisabled()
    expect(downloadButton).toBeDisabled()

    const sitePicker = await screen.findByPlaceholderText(
      "ui:dialog.kiloCode.placeholders.selectSites",
    )
    await user.click(sitePicker)
    await user.clear(sitePicker)
    await user.type(sitePicker, "Site A")
    await user.keyboard("{ArrowDown}")
    await user.click(await screen.findByRole("option", { name: "Site A" }))

    await user.clear(sitePicker)
    await user.type(sitePicker, "Site B")
    await user.keyboard("{ArrowDown}")
    await user.click(await screen.findByRole("option", { name: "Site B" }))

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
    mockGetApiService.mockReturnValue({
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
    })

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
    mockGetApiService.mockReturnValue({
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
      fetchAccountAvailableModels: mockFetchAccountAvailableModels,
      fetchUserGroups: mockFetchUserGroups,
    })
    mockResolveSub2ApiQuickCreateResolution.mockResolvedValueOnce({
      kind: "ready",
      group: "vip",
    })
    mockEnsureAccountApiToken.mockResolvedValueOnce({
      id: 11,
      name: "Created",
      key: "sk-test",
    })

    render(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

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

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    await waitFor(() => {
      expect(mockResolveSub2ApiQuickCreateResolution).toHaveBeenCalledWith(
        expect.objectContaining({ id: "b", siteType: "sub2api" }),
      )
      expect(mockEnsureAccountApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: "b", site_type: "sub2api" }),
        expect.objectContaining({ id: "b", siteType: "sub2api" }),
        expect.objectContaining({
          toastId: "kilocode-create-token-b",
          sub2apiGroup: "vip",
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
    mockGetApiService.mockReturnValue({
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
      fetchAccountAvailableModels: mockFetchAccountAvailableModels,
      fetchUserGroups: mockFetchUserGroups,
    })
    mockResolveSub2ApiQuickCreateResolution.mockResolvedValueOnce({
      kind: "selection_required",
      allowedGroups: ["default", "vip"],
    })
    mockFetchUserGroups.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })

    render(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

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

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    expect(mockEnsureAccountApiToken).not.toHaveBeenCalled()
    expect(
      await screen.findByText("messages:sub2api.createRequiresGroupSelection"),
    ).toBeInTheDocument()
    expect(addTokenDialogPropsMock).toHaveBeenCalled()

    const latestDialogProps = addTokenDialogPropsMock.mock.lastCall?.[0]
    expect(latestDialogProps?.createPrefill).toMatchObject({
      modelId: "",
      defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
      allowedGroups: ["default", "vip"],
    })
    expect(latestDialogProps?.createPrefill).not.toHaveProperty("group")
  })

  it("uses the newest created token after constrained Sub2API creation regardless of fetch order", async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
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
    mockGetApiService.mockReturnValue({
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
    })
    mockResolveSub2ApiQuickCreateResolution.mockResolvedValueOnce({
      kind: "selection_required",
      allowedGroups: ["default", "vip"],
    })

    render(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

    const sitePicker = await screen.findByPlaceholderText(
      "ui:dialog.kiloCode.placeholders.selectSites",
    )
    await user.click(sitePicker)
    await user.clear(sitePicker)
    await user.type(sitePicker, "Site B")
    await user.keyboard("{ArrowDown}")
    await user.click(await screen.findByRole("option", { name: "Site B" }))

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    await user.click(
      await screen.findByRole("button", { name: "mock-add-token-success" }),
    )

    const copyButton = await screen.findByRole("button", {
      name: "ui:dialog.kiloCode.actions.copyApiConfigs",
    })

    await waitFor(() => {
      expect(copyButton).toBeEnabled()
    })

    await user.click(copyButton)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
    })

    const copiedPayload = String(writeText.mock.calls[0]?.[0] ?? "")
    expect(copiedPayload).toContain("sk-newest")
    expect(copiedPayload).not.toContain("sk-older")
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
    mockGetApiService.mockReturnValue({
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
    })
    mockResolveSub2ApiQuickCreateResolution.mockResolvedValueOnce({
      kind: "blocked",
      message: "   ",
    })

    render(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

    const sitePicker = await screen.findByPlaceholderText(
      "ui:dialog.kiloCode.placeholders.selectSites",
    )
    await user.click(sitePicker)
    await user.clear(sitePicker)
    await user.type(sitePicker, "Site B")
    await user.keyboard("{ArrowDown}")
    await user.click(await screen.findByRole("option", { name: "Site B" }))

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.kiloCode.actions.createDefaultToken",
      }),
    )

    const fallbackMessage =
      "Token creation was blocked. Please check site policy or try again."

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(fallbackMessage, {
        id: "kilocode-create-token-b",
      })
    })
    expect(await screen.findByText(fallbackMessage)).toBeInTheDocument()
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
    mockGetApiService.mockReturnValue({
      fetchAccountTokens: mockFetchAccountTokens,
      resolveApiTokenKey: mockResolveApiTokenKey,
    })

    render(<KiloCodeExportDialog isOpen={true} onClose={() => {}} />)

    const sitePicker = await screen.findByPlaceholderText(
      "ui:dialog.kiloCode.placeholders.selectSites",
    )
    await user.click(sitePicker)
    await user.clear(sitePicker)
    await user.type(sitePicker, "Site B")
    await user.keyboard("{ArrowDown}")
    await user.click(await screen.findByRole("option", { name: "Site B" }))

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
  })
})
