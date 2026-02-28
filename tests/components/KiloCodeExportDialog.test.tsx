import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { KiloCodeExportDialog } from "~/components/KiloCodeExportDialog"
import { render, screen, waitFor } from "~/tests/test-utils/render"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const mockUseAccountData = vi.fn()

vi.mock("~/hooks/useAccountData", () => ({
  useAccountData: () => mockUseAccountData(),
}))

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  // Forward through a typed wrapper so call sites avoid `any[]`.
  fetchOpenAICompatibleModelIds: (...args: unknown[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

const mockFetchAccountTokens = vi.fn()
const mockGetApiService = vi.fn()

vi.mock("~/services/apiService", () => ({
  // Forward through a typed wrapper so call sites avoid `any[]`.
  getApiService: (...args: unknown[]) => mockGetApiService(...args),
}))

vi.mock("~/services/accounts/accountOperations", () => ({
  ensureAccountApiToken: vi.fn(),
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

describe("KiloCodeExportDialog", () => {
  beforeEach(() => {
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockFetchOpenAICompatibleModelIds.mockResolvedValue(["gpt-4o-mini"])
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
})
