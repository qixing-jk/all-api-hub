import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ModelRedirectSettings from "~/entrypoints/options/pages/BasicSettings/components/tabs/ManagedSite/ModelRedirectSettings"
import { hasValidManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import { ModelRedirectService } from "~/services/models/modelRedirect"
import { buildManagedSiteChannel } from "~/tests/test-utils/factories"
import { testI18n } from "~/tests/test-utils/i18n"
import { fireEvent, render, screen, waitFor } from "~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", async () => {
  const actual = await vi.importActual<
    typeof import("~/contexts/UserPreferencesContext")
  >("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    useUserPreferencesContext: vi.fn(),
  }
})

vi.mock("~/services/managedSites/managedSiteService", () => ({
  hasValidManagedSiteConfig: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchAccountAvailableModels: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock("~/utils/managedSite", () => ({
  getManagedSiteAdminConfig: vi.fn(() => ({
    baseUrl: "https://example.com",
    adminToken: "token",
    userId: "1",
  })),
}))

vi.mock("~/services/models/modelRedirect", () => ({
  ModelRedirectService: {
    listManagedSiteChannels: vi.fn(),
    clearChannelModelMappings: vi.fn(),
    applyModelRedirect: vi.fn(),
  },
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockedUseUserPreferencesContext =
  useUserPreferencesContext as unknown as ReturnType<typeof vi.fn>
const mockedHasValidManagedSiteConfig =
  hasValidManagedSiteConfig as unknown as ReturnType<typeof vi.fn>
const mockedModelRedirectService = ModelRedirectService as unknown as {
  listManagedSiteChannels: ReturnType<typeof vi.fn>
  clearChannelModelMappings: ReturnType<typeof vi.fn>
}

describe("Model redirect bulk clear flow", () => {
  const t = testI18n.getFixedT("en", "modelRedirect")

  beforeEach(() => {
    vi.clearAllMocks()

    mockedHasValidManagedSiteConfig.mockReturnValue(true)
    mockedUseUserPreferencesContext.mockReturnValue({
      preferences: {
        managedSiteType: "new-api",
        modelRedirect: {
          enabled: true,
          standardModels: [],
        },
      },
      updateModelRedirect: vi.fn().mockResolvedValue(true),
      resetModelRedirectConfig: vi.fn(),
    })

    mockedModelRedirectService.listManagedSiteChannels.mockResolvedValue({
      success: true,
      channels: [
        buildManagedSiteChannel({
          id: 1,
          name: "Channel One",
          model_mapping: '{"gpt-4o":"openai/gpt-4o"}',
        }),
        buildManagedSiteChannel({
          id: 2,
          name: "Channel Two",
          model_mapping: "{}",
        }),
      ],
      errors: [],
    })
  })

  const renderSubject = () => render(<ModelRedirectSettings />)

  it("does not clear when confirmation is canceled", async () => {
    renderSubject()

    fireEvent.click(
      await screen.findByRole("button", { name: t("bulkClear.action") }),
    )

    await screen.findByText("Channel One")

    fireEvent.click(
      screen.getByRole("button", { name: t("bulkClear.actions.continue") }),
    )
    await screen.findByText(t("bulkClear.confirm.title"))

    fireEvent.click(
      screen.getByRole("button", { name: t("bulkClear.actions.cancel") }),
    )

    expect(
      mockedModelRedirectService.clearChannelModelMappings,
    ).not.toHaveBeenCalled()
  })

  it("calls the service with selected IDs", async () => {
    mockedModelRedirectService.clearChannelModelMappings.mockResolvedValue({
      success: true,
      totalSelected: 2,
      clearedChannels: 1,
      skippedChannels: 1,
      failedChannels: 0,
      results: [],
      errors: [],
    })

    renderSubject()

    fireEvent.click(
      await screen.findByRole("button", { name: t("bulkClear.action") }),
    )

    await screen.findByText("Channel One")

    fireEvent.click(
      screen.getByRole("button", { name: t("bulkClear.actions.continue") }),
    )
    await screen.findByText(t("bulkClear.confirm.title"))

    fireEvent.click(
      screen.getByRole("button", { name: t("bulkClear.actions.confirm") }),
    )

    await waitFor(() => {
      expect(
        mockedModelRedirectService.clearChannelModelMappings,
      ).toHaveBeenCalledWith([1, 2])
    })

    expect(toast.success).toHaveBeenCalled()
  })

  it("filters channels by search and previews mapping", async () => {
    renderSubject()

    fireEvent.click(
      await screen.findByRole("button", { name: t("bulkClear.action") }),
    )

    await screen.findByText("Channel One")

    fireEvent.change(
      screen.getByPlaceholderText(t("bulkClear.search.placeholder")),
      { target: { value: "One" } },
    )

    expect(screen.getByText("Channel One")).toBeInTheDocument()
    expect(screen.queryByText("Channel Two")).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: t("bulkClear.preview.mappingToggle"),
      }),
    )

    expect(screen.getByText(/"gpt-4o"/)).toBeInTheDocument()
  })

  it("sorts channels by mapping count (desc)", async () => {
    mockedModelRedirectService.listManagedSiteChannels.mockResolvedValue({
      success: true,
      channels: [
        buildManagedSiteChannel({
          id: 1,
          name: "Few",
          model_mapping: '{"a":"b"}',
        }),
        buildManagedSiteChannel({
          id: 2,
          name: "Many",
          model_mapping: '{"a":"b","c":"d"}',
        }),
        buildManagedSiteChannel({ id: 3, name: "Empty", model_mapping: "{}" }),
      ],
      errors: [],
    })

    renderSubject()

    fireEvent.click(
      await screen.findByRole("button", { name: t("bulkClear.action") }),
    )

    const many = await screen.findByText("Many")
    const few = screen.getByText("Few")
    const empty = screen.getByText("Empty")

    expect(
      many.compareDocumentPosition(few) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      few.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
