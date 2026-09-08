import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ModelRedirectSettings from "~/features/BasicSettings/components/tabs/ManagedSite/ModelRedirectSettings"
import toast from "~/lib/notify"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import {
  hasValidManagedSiteConfig,
  resolveCurrentManagedSiteRuntimeConfig,
} from "~/services/managedSites/runtimeConfig"
import { ModelRedirectService } from "~/services/models/modelRedirect"
import { supportsManagedSiteModelRedirect } from "~/services/models/modelRedirect/capabilities"
import { testI18n } from "~~/tests/test-utils/i18n"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"
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

vi.mock("~/services/apiAdapters/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiAdapters/registry")>()),
  getManagedSiteCapabilities: vi.fn(() => ({
    queries: {
      accountAvailableModels: { fetch: vi.fn().mockResolvedValue([]) },
    },
  })),
}))
vi.mock("~/services/managedSites/runtimeConfig", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/managedSites/runtimeConfig")
  >()),
  hasValidManagedSiteConfig: vi.fn(),
  resolveCurrentManagedSiteRuntimeConfig: vi.fn(() => ({
    siteType: "new-api",
    config: {
      baseUrl: "https://example.com",
      adminToken: "token",
      userId: "1",
    },
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

vi.mock("~/lib/notify", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

const mockedUseUserPreferencesContext =
  useUserPreferencesContext as unknown as ReturnType<typeof vi.fn>
const mockedHasValidManagedSiteConfig =
  hasValidManagedSiteConfig as unknown as ReturnType<typeof vi.fn>
const mockedGetManagedSiteCapabilitiesForType =
  getManagedSiteCapabilities as unknown as ReturnType<typeof vi.fn>
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
    mockedGetManagedSiteCapabilitiesForType.mockReturnValue({
      queries: {
        accountAvailableModels: { fetch: vi.fn().mockResolvedValue([]) },
      },
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
        {
          ref: modelResourceRef(1),
          name: "Channel One",
          modelMapping: '{"gpt-4o":"openai/gpt-4o"}',
        },
        {
          ref: modelResourceRef(2),
          name: "Channel Two",
          modelMapping: "{}",
        },
      ],
      errors: [],
    })
  })

  const renderSubject = () => render(<ModelRedirectSettings />)

  it("discovers models from the default New API configuration in legacy preferences", async () => {
    const user = userEvent.setup()
    const runtimeConfig = await vi.importActual<
      typeof import("~/services/managedSites/runtimeConfig")
    >("~/services/managedSites/runtimeConfig")
    const redirectCapabilities = await vi.importActual<
      typeof import("~/services/models/modelRedirect/capabilities")
    >("~/services/models/modelRedirect/capabilities")
    const registry = await vi.importActual<
      typeof import("~/services/apiAdapters/registry")
    >("~/services/apiAdapters/registry")
    const config = {
      baseUrl: "https://legacy.example.invalid",
      adminToken: "legacy-admin-token",
      userId: "7",
    }
    const fetch = vi.fn().mockResolvedValue(["legacy-discovered-model"])
    vi.mocked(resolveCurrentManagedSiteRuntimeConfig).mockImplementationOnce(
      runtimeConfig.resolveCurrentManagedSiteRuntimeConfig,
    )
    vi.mocked(supportsManagedSiteModelRedirect).mockImplementation(
      redirectCapabilities.supportsManagedSiteModelRedirect,
    )
    mockedGetManagedSiteCapabilitiesForType.mockImplementation((siteType) => ({
      ...registry.getManagedSiteCapabilities(siteType),
      queries: { accountAvailableModels: { fetch } },
    }))
    mockedUseUserPreferencesContext.mockReturnValue({
      preferences: {
        newApi: config,
        modelRedirect: { enabled: true, standardModels: [] },
      },
      updateModelRedirect: vi.fn(),
      resetModelRedirectConfig: vi.fn(),
    })

    renderSubject()

    await user.click(
      await screen.findByRole("combobox", {
        name: "modelRedirect:standardModels",
      }),
    )
    expect(
      await screen.findByRole("option", { name: "legacy-discovered-model" }),
    ).toBeVisible()
    expect(fetch).toHaveBeenCalledWith(config)
  })

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
    mockedGetManagedSiteCapabilitiesForType.mockReturnValue({})

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
    vi.mocked(resolveCurrentManagedSiteRuntimeConfig).mockReturnValueOnce(null)

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
    mockedGetManagedSiteCapabilitiesForType.mockReturnValue({
      queries: {
        accountAvailableModels: {
          fetch: vi.fn().mockRejectedValue(new Error("request failed")),
        },
      },
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

  it("calls the service with complete selected resource references", async () => {
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
      ).toHaveBeenCalledWith([modelResourceRef(1), modelResourceRef(2)])
    })

    expect(toast.warning).toHaveBeenCalled()
  })

  it("preserves hidden selections while toggling and bulk-selecting filtered resource references", async () => {
    const user = userEvent.setup()
    mockedModelRedirectService.listManagedSiteChannels.mockResolvedValue({
      success: true,
      channels: [
        {
          ref: modelResourceRef(10),
          name: "Shared",
          modelMapping: '{"a":"b"}',
        },
        { ref: modelResourceRef(2), name: "Shared", modelMapping: '{"a":"b"}' },
        {
          ref: modelResourceRef(3),
          name: "Unfiltered",
          modelMapping: '{"a":"b"}',
        },
      ],
      errors: [],
    })
    mockedModelRedirectService.clearChannelModelMappings.mockResolvedValue({
      success: true,
      totalSelected: 2,
      clearedChannels: 2,
      skippedChannels: 0,
      failedChannels: 0,
      results: [],
      errors: [],
    })
    renderSubject()
    await user.click(
      await screen.findByRole("button", { name: t("bulkClear.action") }),
    )

    const second = await screen.findByRole("checkbox", { name: "Shared (#2)" })
    const tenth = screen.getByRole("checkbox", { name: "Shared (#10)" })
    const hidden = screen.getByRole("checkbox", { name: "Unfiltered (#3)" })
    expect(
      screen.getAllByRole("checkbox", { name: /^(Shared|Unfiltered) \(#/ }),
    ).toEqual([second, tenth, hidden])
    await user.click(second)
    expect(second).not.toBeChecked()
    await user.click(second)
    expect(second).toBeChecked()

    const search = screen.getByPlaceholderText(
      t("bulkClear.search.placeholder"),
    )
    await user.type(search, "Shared")
    await user.click(
      screen.getByRole("button", { name: t("bulkClear.actions.selectNone") }),
    )
    expect(second).not.toBeChecked()
    expect(tenth).not.toBeChecked()
    await user.clear(search)
    expect(
      screen.getByRole("checkbox", { name: "Unfiltered (#3)" }),
    ).toBeChecked()

    await user.type(search, "Shared")
    await user.click(
      screen.getByRole("button", { name: t("bulkClear.actions.selectAll") }),
    )
    expect(second).toBeChecked()
    expect(tenth).toBeChecked()
    await user.click(tenth)
    await user.click(
      screen.getByRole("button", { name: t("bulkClear.actions.continue") }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: t("bulkClear.actions.confirm"),
      }),
    )

    await waitFor(() => {
      expect(
        mockedModelRedirectService.clearChannelModelMappings,
      ).toHaveBeenCalledWith([modelResourceRef(2), modelResourceRef(3)])
    })
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
        {
          ref: modelResourceRef(1),
          name: "Few",
          modelMapping: '{"a":"b"}',
        },
        {
          ref: modelResourceRef(2),
          name: "Many",
          modelMapping: '{"a":"b","c":"d"}',
        },
        { ref: modelResourceRef(3), name: "Empty", modelMapping: "{}" },
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
