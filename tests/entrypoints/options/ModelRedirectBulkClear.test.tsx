import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ModelRedirectSettings from "~/features/BasicSettings/components/tabs/ManagedSite/ModelRedirectSettings"
import {
  getManagedSiteServiceForType,
  hasValidManagedSiteConfig,
} from "~/services/managedSites/managedSiteService"
import { getManagedSiteAdminConfig } from "~/services/managedSites/utils/managedSite"
import { ModelRedirectService } from "~/services/models/modelRedirect"
import { supportsManagedSiteModelRedirect } from "~/services/models/modelRedirect/capabilities"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"
import { testI18n } from "~~/tests/test-utils/i18n"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

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
  getManagedSiteServiceForType: vi.fn(() => ({
    fetchAccountAvailableModels: vi.fn().mockResolvedValue([]),
  })),
  hasValidManagedSiteConfig: vi.fn(),
}))

vi.mock("~/services/managedSites/utils/managedSite", () => ({
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

vi.mock("~/services/models/modelRedirect/capabilities", () => ({
  supportsManagedSiteModelRedirect: vi.fn(),
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
const mockedGetManagedSiteServiceForType =
  getManagedSiteServiceForType as unknown as ReturnType<typeof vi.fn>
const mockedModelRedirectService = ModelRedirectService as unknown as {
  listManagedSiteChannels: ReturnType<typeof vi.fn>
  clearChannelModelMappings: ReturnType<typeof vi.fn>
}

describe("Model redirect bulk clear flow", () => {
  const t = testI18n.getFixedT("en", "modelRedirect")

  beforeEach(() => {
    vi.clearAllMocks()

    mockedHasValidManagedSiteConfig.mockReturnValue(true)
    vi.mocked(supportsManagedSiteModelRedirect).mockReturnValue(true)
    mockedGetManagedSiteServiceForType.mockReturnValue({
      fetchAccountAvailableModels: vi.fn().mockResolvedValue([]),
    })
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

  it("shows the preference write failure message when enabling redirects fails", async () => {
    const updateModelRedirect = vi.fn().mockResolvedValue({
      ok: false,
      reason: {
        type: "storage-error",
        error: new Error("save failed"),
      },
    })
    mockedUseUserPreferencesContext.mockReturnValue({
      preferences: {
        managedSiteType: "new-api",
        modelRedirect: {
          enabled: false,
          standardModels: [],
        },
      },
      updateModelRedirect,
      resetModelRedirectConfig: vi.fn(),
    })

    renderSubject()

    fireEvent.click(await screen.findByRole("switch", { name: "Toggle" }))

    await waitFor(() => {
      expect(updateModelRedirect).toHaveBeenCalledWith({ enabled: true })
      expect(toast.error).toHaveBeenCalledWith(
        "modelRedirect:messages.updateFailed",
      )
    })
  })

  it("shows an unsupported explanation instead of controls when the registry methods are absent", async () => {
    vi.mocked(supportsManagedSiteModelRedirect).mockReturnValue(false)
    mockedUseUserPreferencesContext.mockReturnValue({
      preferences: {
        managedSiteType: "octopus",
        modelRedirect: {
          enabled: false,
          standardModels: [],
        },
      },
      updateModelRedirect: vi.fn(),
      resetModelRedirectConfig: vi.fn(),
    })

    renderSubject()

    expect(
      await screen.findByText("modelRedirect:unsupported.title"),
    ).toBeVisible()
    expect(supportsManagedSiteModelRedirect).toHaveBeenCalledWith("octopus")
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: t("bulkClear.action") }),
    ).not.toBeInTheDocument()
  })

  it("explains when model discovery is unsupported but keeps preset configuration available", async () => {
    mockedGetManagedSiteServiceForType.mockReturnValue({})

    renderSubject()

    expect(
      await screen.findByText("modelRedirect:modelDiscovery.unsupported.title"),
    ).toBeVisible()
    expect(screen.getByRole("switch", { name: "Toggle" })).toBeVisible()
  })

  it("explains that model discovery is not ready while preferences are unavailable", async () => {
    mockedUseUserPreferencesContext.mockReturnValue({
      preferences: undefined,
      updateModelRedirect: vi.fn(),
      resetModelRedirectConfig: vi.fn(),
    })

    renderSubject()

    expect(
      await screen.findByText("modelRedirect:modelDiscovery.not-ready.title"),
    ).toBeVisible()
    expect(screen.getByRole("switch", { name: "Toggle" })).toBeVisible()
    expect(
      screen.getByRole("button", { name: t("bulkClear.action") }),
    ).toBeDisabled()
  })

  it("explains that model discovery is not ready when managed-site setup is invalid", async () => {
    mockedHasValidManagedSiteConfig.mockReturnValue(false)
    vi.mocked(getManagedSiteAdminConfig).mockReturnValueOnce(null)

    renderSubject()

    expect(
      await screen.findByText("modelRedirect:modelDiscovery.not-ready.title"),
    ).toBeVisible()
    expect(screen.getByRole("switch", { name: "Toggle" })).toBeVisible()
    expect(
      screen.getByRole("button", { name: t("bulkClear.action") }),
    ).toBeDisabled()
  })

  it("reports model discovery failures instead of silently using presets", async () => {
    mockedGetManagedSiteServiceForType.mockReturnValue({
      fetchAccountAvailableModels: vi
        .fn()
        .mockRejectedValue(new Error("request failed")),
    })

    renderSubject()

    expect(
      await screen.findByText("modelRedirect:modelDiscovery.failed.title"),
    ).toBeVisible()
    expect(screen.getByRole("switch", { name: "Toggle" })).toBeVisible()
  })

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
