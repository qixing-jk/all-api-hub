import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import toast from "react-hot-toast"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ModelRedirectSettings from "~/entrypoints/options/pages/BasicSettings/components/ModelRedirectSettings"
import modelRedirectEn from "~/locales/en/modelRedirect.json"
import { hasValidManagedSiteConfig } from "~/services/managedSiteService"
import { ModelRedirectService } from "~/services/modelRedirect"
import { testI18n } from "~/tests/test-utils/i18n"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/services/managedSiteService", () => ({
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

vi.mock("~/services/modelRedirect", () => ({
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
  testI18n.addResourceBundle("en", "modelRedirect", modelRedirectEn, true, true)

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
        {
          id: 1,
          name: "Channel One",
          model_mapping: '{"gpt-4o":"openai/gpt-4o"}',
        },
        { id: 2, name: "Channel Two", model_mapping: "{}" },
      ],
      errors: [],
    })
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <ModelRedirectSettings />
      </I18nextProvider>,
    )

  it("does not clear when confirmation is canceled", async () => {
    renderSubject()

    fireEvent.click(screen.getByRole("button", { name: t("bulkClear.action") }))

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
      totalSelected: 1,
      clearedChannels: 1,
      failedChannels: 0,
      results: [],
      errors: [],
    })

    renderSubject()

    fireEvent.click(screen.getByRole("button", { name: t("bulkClear.action") }))

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
      ).toHaveBeenCalledWith([1])
    })

    expect(toast.success).toHaveBeenCalled()
  })

  it("filters channels by search and previews mapping", async () => {
    renderSubject()

    fireEvent.click(screen.getByRole("button", { name: t("bulkClear.action") }))

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
        { id: 1, name: "Few", model_mapping: '{"a":"b"}' },
        { id: 2, name: "Many", model_mapping: '{"a":"b","c":"d"}' },
        { id: 3, name: "Empty", model_mapping: "{}" },
      ],
      errors: [],
    })

    renderSubject()

    fireEvent.click(screen.getByRole("button", { name: t("bulkClear.action") }))

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
