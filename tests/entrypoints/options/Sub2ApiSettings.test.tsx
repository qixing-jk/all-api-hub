import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import Sub2ApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/Sub2ApiSettings"
import { validateSub2ApiManagedSiteConfig } from "~/services/managedSites/providers/sub2api"
import { testI18n } from "~~/tests/test-utils/i18n"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))
vi.mock("~/services/managedSites/providers/sub2api", () => ({
  validateSub2ApiManagedSiteConfig: vi.fn(),
}))
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

const successfulWrite = { ok: true, preferences: {} }

describe("Sub2ApiSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const arrange = (overrides: Record<string, unknown> = {}) => {
    const context = {
      preferences: { lastUpdated: 7 },
      sub2ApiManagedSiteBaseUrl: "https://sub2api.example.com",
      sub2ApiManagedSiteAdminToken: "admin-key",
      updateSub2ApiManagedSiteBaseUrl: vi
        .fn()
        .mockResolvedValue(successfulWrite),
      updateSub2ApiManagedSiteAdminToken: vi
        .fn()
        .mockResolvedValue(successfulWrite),
      updateSub2ApiManagedSiteConfig: vi
        .fn()
        .mockResolvedValue(successfulWrite),
      resetSub2ApiManagedSiteConfig: vi.fn().mockResolvedValue(successfulWrite),
      ...overrides,
    }
    vi.mocked(useUserPreferencesContext).mockReturnValue(context as any)
    render(
      <I18nextProvider i18n={testI18n}>
        <Sub2ApiSettings />
      </I18nextProvider>,
    )
    return context
  }

  it("uses stable settings targets and discloses the default-only scope", () => {
    arrange()

    expect(document.getElementById(SETTINGS_ANCHORS.SUB2API)).not.toBeNull()
    expect(
      document.getElementById(SETTINGS_ANCHORS.SUB2API_ADMIN_API_KEY),
    ).not.toBeNull()
    expect(
      screen.getByText("settings:sub2apiManagedSite.defaultScope.title"),
    ).toBeInTheDocument()
  })

  it("validates the trimmed URL and Admin API Key before saving them", async () => {
    const context = arrange()
    vi.mocked(validateSub2ApiManagedSiteConfig).mockResolvedValue()

    fireEvent.change(
      screen.getByPlaceholderText(
        "settings:sub2apiManagedSite.fields.baseUrlPlaceholder",
      ),
      { target: { value: "  https://managed.example.invalid/  " } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "settings:sub2apiManagedSite.fields.adminApiKeyPlaceholder",
      ),
      { target: { value: "  next-admin-key  " } },
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:sub2apiManagedSite.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(validateSub2ApiManagedSiteConfig).toHaveBeenCalledWith({
        baseUrl: "https://managed.example.invalid/",
        adminToken: "next-admin-key",
      })
    })
    expect(context.updateSub2ApiManagedSiteConfig).toHaveBeenCalledWith(
      {
        baseUrl: "https://managed.example.invalid/",
        adminToken: "next-admin-key",
      },
      { expectedLastUpdated: 7 },
    )
  })

  it("does not validate blank credentials", async () => {
    const toast = await import("react-hot-toast")
    arrange({
      sub2ApiManagedSiteBaseUrl: "",
      sub2ApiManagedSiteAdminToken: "",
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:sub2apiManagedSite.validation.validate",
      }),
    )

    expect(validateSub2ApiManagedSiteConfig).not.toHaveBeenCalled()
    expect(vi.mocked(toast.default.error)).toHaveBeenCalledWith(
      "settings:sub2apiManagedSite.validation.missingFields",
    )
  })
})
