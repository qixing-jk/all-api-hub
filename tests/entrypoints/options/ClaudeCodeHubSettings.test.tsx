import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ClaudeCodeHubSettings from "~/features/BasicSettings/components/tabs/ManagedSite/ClaudeCodeHubSettings"
import { validateClaudeCodeHubConfig } from "~/services/apiService/claudeCodeHub"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { testI18n } from "~~/tests/test-utils/i18n"

const { showUpdateToastMock } = vi.hoisted(() => ({
  showUpdateToastMock: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/services/apiService/claudeCodeHub", () => ({
  validateClaudeCodeHubConfig: vi.fn(),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  createVersionedPreferenceSaveOptions: (expectedLastUpdated: number) => ({
    expectedLastUpdated,
  }),
  runPreferenceUpdateWithToast: async ({
    expectedLastUpdated,
    setting,
    update,
  }: {
    expectedLastUpdated: number
    setting: string
    update: (options: { expectedLastUpdated: number }) => Promise<any>
  }) => {
    const result = await update({ expectedLastUpdated })
    showUpdateToastMock(result, setting)
    return result
  },
  showUpdateToast: showUpdateToastMock,
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const mockedValidateClaudeCodeHubConfig =
  validateClaudeCodeHubConfig as ReturnType<typeof vi.fn>
const mockedShowUpdateToast = showUpdateToast as ReturnType<typeof vi.fn>

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe("ClaudeCodeHubSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <ClaudeCodeHubSettings />
      </I18nextProvider>,
    )

  it("trims the base URL before persisting", async () => {
    const updateClaudeCodeHubBaseUrl = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      claudeCodeHubBaseUrl: "https://cch.example.com",
      claudeCodeHubAdminToken: "admin-token",
      updateClaudeCodeHubBaseUrl,
      updateClaudeCodeHubAdminToken: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateClaudeCodeHubConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetClaudeCodeHubConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      "settings:claudeCodeHub.fields.baseUrlPlaceholder",
    )

    fireEvent.change(input, {
      target: { value: "  https://managed-cch.example.com/  " },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateClaudeCodeHubBaseUrl).toHaveBeenCalledWith(
        "https://managed-cch.example.com/",
        {
          expectedLastUpdated: 1,
        },
      )
    })

    expect(mockedShowUpdateToast).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      "settings:claudeCodeHub.fields.baseUrlLabel",
    )
  })

  it("trims the admin token before persisting and skips unchanged trimmed values", async () => {
    const updateClaudeCodeHubAdminToken = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 2 },
      claudeCodeHubBaseUrl: "https://cch.example.com",
      claudeCodeHubAdminToken: "same-token",
      updateClaudeCodeHubBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateClaudeCodeHubAdminToken,
      updateClaudeCodeHubConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetClaudeCodeHubConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    const input = screen.getByDisplayValue("same-token")
    fireEvent.change(input, {
      target: { value: "  next-token  " },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateClaudeCodeHubAdminToken).toHaveBeenCalledWith("next-token", {
        expectedLastUpdated: 2,
      })
    })

    fireEvent.change(input, {
      target: { value: "  same-token  " },
    })
    fireEvent.blur(input)

    expect(updateClaudeCodeHubAdminToken).toHaveBeenCalledTimes(1)
    expect(mockedShowUpdateToast).toHaveBeenCalledTimes(1)
    expect(mockedShowUpdateToast).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      "settings:claudeCodeHub.fields.adminTokenLabel",
    )
  })

  it("shows a missing-fields error when validation inputs are blank after trimming", async () => {
    const toast = await import("react-hot-toast")

    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 3 },
      claudeCodeHubBaseUrl: "",
      claudeCodeHubAdminToken: "",
      updateClaudeCodeHubBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateClaudeCodeHubAdminToken: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateClaudeCodeHubConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetClaudeCodeHubConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    fireEvent.change(
      screen.getByPlaceholderText(
        "settings:claudeCodeHub.fields.baseUrlPlaceholder",
      ),
      {
        target: { value: "   " },
      },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "settings:claudeCodeHub.fields.adminTokenPlaceholder",
      ),
      {
        target: { value: "   " },
      },
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:claudeCodeHub.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.default.error)).toHaveBeenCalledWith(
        "settings:claudeCodeHub.validation.missingFields",
      )
    })
    expect(mockedValidateClaudeCodeHubConfig).not.toHaveBeenCalled()
  })

  it("exposes only validation as busy, suppresses duplicate clicks, and restores on success", async () => {
    const toast = await import("react-hot-toast")
    const deferredValidation = createDeferred<{ ok: boolean }>()
    const updateClaudeCodeHubConfig = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })

    mockedValidateClaudeCodeHubConfig.mockReturnValue(
      deferredValidation.promise,
    )
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 4 },
      claudeCodeHubBaseUrl: "https://cch.example.com",
      claudeCodeHubAdminToken: "admin-token",
      updateClaudeCodeHubBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateClaudeCodeHubAdminToken: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateClaudeCodeHubConfig,
      resetClaudeCodeHubConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    fireEvent.change(
      screen.getByPlaceholderText(
        "settings:claudeCodeHub.fields.baseUrlPlaceholder",
      ),
      {
        target: { value: "  https://managed-cch.example.com  " },
      },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "settings:claudeCodeHub.fields.adminTokenPlaceholder",
      ),
      {
        target: { value: "  next-admin-token  " },
      },
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:claudeCodeHub.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(mockedValidateClaudeCodeHubConfig).toHaveBeenCalledWith({
        baseUrl: "https://managed-cch.example.com",
        adminToken: "next-admin-token",
      })
    })

    const validatingButton = screen.getByRole("button", {
      name: "settings:claudeCodeHub.validation.validating",
    })
    expect(validatingButton).toBeDisabled()
    expect(validatingButton).toHaveAttribute("aria-busy", "true")
    expect(
      screen.getByRole("button", { name: "common:actions.reset" }),
    ).not.toHaveAttribute("aria-busy")

    fireEvent.click(validatingButton)
    expect(mockedValidateClaudeCodeHubConfig).toHaveBeenCalledTimes(1)

    deferredValidation.resolve({ ok: true })

    await waitFor(() => {
      expect(updateClaudeCodeHubConfig).toHaveBeenCalledWith(
        {
          baseUrl: "https://managed-cch.example.com",
          adminToken: "next-admin-token",
        },
        {
          expectedLastUpdated: 4,
        },
      )
    })

    expect(vi.mocked(toast.default.success)).toHaveBeenCalledWith(
      "settings:claudeCodeHub.validation.success",
    )
    const restoredButton = screen.getByRole("button", {
      name: "settings:claudeCodeHub.validation.validate",
    })
    expect(restoredButton).toBeEnabled()
    expect(restoredButton).not.toHaveAttribute("aria-busy")
  })

  it("shows a validation failure toast when Claude Code Hub rejects the config", async () => {
    const toast = await import("react-hot-toast")

    mockedValidateClaudeCodeHubConfig.mockRejectedValueOnce(
      new Error("request failed"),
    )
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 5 },
      claudeCodeHubBaseUrl: "https://cch.example.com",
      claudeCodeHubAdminToken: "admin-token",
      updateClaudeCodeHubBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateClaudeCodeHubAdminToken: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateClaudeCodeHubConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetClaudeCodeHubConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:claudeCodeHub.validation.validate",
      }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.default.error)).toHaveBeenCalledWith(
        "settings:claudeCodeHub.validation.failed",
      )
    })
  })
})
