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
    const toast = await import("react-hot-toast")
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
    await waitFor(() => {
      expect(vi.mocked(toast.default.success)).toHaveBeenCalledWith(
        "settings:sub2apiManagedSite.validation.success",
      )
    })
  })

  it("saves trimmed field changes on blur and skips unchanged values", async () => {
    const context = arrange()
    const baseUrl = screen.getByPlaceholderText(
      "settings:sub2apiManagedSite.fields.baseUrlPlaceholder",
    )
    const adminKey = screen.getByPlaceholderText(
      "settings:sub2apiManagedSite.fields.adminApiKeyPlaceholder",
    )

    fireEvent.blur(baseUrl, {
      target: { value: "https://sub2api.example.com" },
    })
    fireEvent.blur(adminKey, { target: { value: "admin-key" } })
    expect(context.updateSub2ApiManagedSiteBaseUrl).not.toHaveBeenCalled()
    expect(context.updateSub2ApiManagedSiteAdminToken).not.toHaveBeenCalled()

    fireEvent.blur(baseUrl, {
      target: { value: "  https://next.example.invalid/  " },
    })
    fireEvent.blur(adminKey, { target: { value: "  next-admin-key  " } })

    await waitFor(() => {
      expect(context.updateSub2ApiManagedSiteBaseUrl).toHaveBeenCalledWith(
        "https://next.example.invalid/",
        { expectedLastUpdated: 7 },
      )
      expect(context.updateSub2ApiManagedSiteAdminToken).toHaveBeenCalledWith(
        "next-admin-key",
        { expectedLastUpdated: 7 },
      )
    })
  })

  it("reports save conflicts and validation errors", async () => {
    const toast = await import("react-hot-toast")
    const failedWrite = {
      ok: false,
      reason: { type: "stale" as const, currentLastUpdated: 9 },
    }
    const context = arrange({
      updateSub2ApiManagedSiteConfig: vi
        .fn()
        .mockResolvedValueOnce(failedWrite),
    })
    vi.mocked(validateSub2ApiManagedSiteConfig).mockResolvedValueOnce()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:sub2apiManagedSite.validation.validate",
      }),
    )
    await waitFor(() => {
      expect(context.updateSub2ApiManagedSiteConfig).toHaveBeenCalled()
      expect(vi.mocked(toast.default.error)).toHaveBeenCalled()
    })

    vi.mocked(toast.default.error).mockClear()
    vi.mocked(validateSub2ApiManagedSiteConfig).mockRejectedValueOnce(
      new Error("provider unavailable"),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:sub2apiManagedSite.validation.validate",
      }),
    )
    await waitFor(() => {
      expect(vi.mocked(toast.default.error)).toHaveBeenCalledWith(
        "settings:sub2apiManagedSite.validation.failed",
      )
    })
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
