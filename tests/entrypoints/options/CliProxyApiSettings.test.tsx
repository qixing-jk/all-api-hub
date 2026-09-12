import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import CliProxyApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/CliProxyApiSettings"
import {
  CliProxyApiError,
  listAllCliProxyApiProviders,
} from "~/services/apiService/cliProxyApi"
import { showResultToast } from "~/utils/feedback/operationFeedback"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"
import { testI18n } from "~~/tests/test-utils/i18n"

const { showResultToastMock, showUpdateToastMock, toastErrorMock } = vi.hoisted(
  () => ({
    showResultToastMock: vi.fn(),
    showUpdateToastMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }),
)

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/services/apiService/cliProxyApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/apiService/cliProxyApi")>()
  return {
    ...actual,
    listAllCliProxyApiProviders: vi.fn(),
  }
})

vi.mock("~/utils/feedback/preferenceFeedback", () => ({
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
    if (result?.ok === false && result.reason?.type === "stale") {
      toastErrorMock("settings:messages.preferencesChangedExternally")
    } else {
      showUpdateToastMock(result, setting)
    }
    return result
  },
  showUpdateToast: showUpdateToastMock,
}))
vi.mock("~/utils/feedback/operationFeedback", () => ({
  showResultToast: showResultToastMock,
}))

vi.mock("~/lib/notify", () => ({
  default: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

describe("CliProxyApiSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyApiBaseUrl: "http://localhost:8317/v0/management",
      cliProxyApiManagementKey: "secret-key",
      updateCliProxyApiBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateCliProxyApiManagementKey: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetCliProxyApiConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    vi.mocked(listAllCliProxyApiProviders).mockResolvedValue([])
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <CliProxyApiSettings />
      </I18nextProvider>,
    )

  it.each([
    [401, "managementApiInvalidKey"],
    [403, "managementApiForbidden"],
    [404, "managementApiNotFound"],
    [500, "managementApiHttpError"],
  ])(
    "shows actionable connection feedback for HTTP %s",
    async (status, message) => {
      vi.mocked(listAllCliProxyApiProviders).mockRejectedValue(
        new CliProxyApiError(Number(status)),
      )
      renderSubject()
      const input = screen.getByPlaceholderText(
        "http://localhost:8317/v0/management",
      )
      fireEvent.change(input, { target: { value: "http://localhost:9000" } })
      input.focus()
      fireEvent.keyDown(input, { key: "Enter" })
      await waitFor(() =>
        expect(showResultToastMock).toHaveBeenCalledWith({
          success: false,
          message: `messages:cliProxyApi.${message}`,
        }),
      )
    },
  )

  it("saves a trimmed base URL on Enter and re-checks the connection", async () => {
    const updateCliProxyApiBaseUrl = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyApiBaseUrl: "http://localhost:8317/v0/management",
      cliProxyApiManagementKey: "secret-key",
      updateCliProxyApiBaseUrl,
      updateCliProxyApiManagementKey: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetCliProxyApiConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      "http://localhost:8317/v0/management",
    )

    fireEvent.change(input, {
      target: { value: "  http://localhost:9000/v0/management  " },
    })
    input.focus()
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => {
      expect(updateCliProxyApiBaseUrl).toHaveBeenCalledWith(
        "http://localhost:9000/v0/management",
        expect.objectContaining({
          expectedLastUpdated: 1,
        }),
      )
    })

    await waitFor(() => {
      expect(listAllCliProxyApiProviders).toHaveBeenCalledWith({
        baseUrl: "http://localhost:9000/v0/management",
        adminToken: "secret-key",
      })
    })

    expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      "settings:cliProxyApi.baseUrlLabel",
    )
    expect(vi.mocked(showResultToast)).toHaveBeenCalledWith({
      success: true,
      message: "messages:cliProxyApi.managementApiConnectionSuccess",
    })
  })

  it("shows stale preference guidance instead of a generic update failure", async () => {
    const updateCliProxyApiBaseUrl = vi
      .fn()
      .mockImplementation(
        async (
          _url: string,
          _options?: { expectedLastUpdated?: number },
        ): Promise<any> => {
          return {
            ok: false,
            reason: {
              type: "stale",
              expectedLastUpdated: 1,
              actualLastUpdated: 2,
            },
          }
        },
      )
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyApiBaseUrl: "http://localhost:8317/v0/management",
      cliProxyApiManagementKey: "secret-key",
      updateCliProxyApiBaseUrl,
      updateCliProxyApiManagementKey: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetCliProxyApiConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      "http://localhost:8317/v0/management",
    )

    fireEvent.change(input, {
      target: { value: "http://localhost:9000/v0/management" },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "settings:messages.preferencesChangedExternally",
      )
    })

    expect(updateCliProxyApiBaseUrl).toHaveBeenCalledWith(
      "http://localhost:9000/v0/management",
      expect.objectContaining({
        expectedLastUpdated: 1,
      }),
    )
    expect(vi.mocked(showUpdateToast)).not.toHaveBeenCalled()
    expect(listAllCliProxyApiProviders).not.toHaveBeenCalled()
  })

  it("trims the management key before persisting and surfaces the connection-check result", async () => {
    const updateCliProxyApiManagementKey = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    vi.mocked(listAllCliProxyApiProviders).mockRejectedValue(
      new Error("connection failed"),
    )
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyApiBaseUrl: "http://localhost:8317/v0/management",
      cliProxyApiManagementKey: "secret-key",
      updateCliProxyApiBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateCliProxyApiManagementKey,
      resetCliProxyApiConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    const input = screen.getByLabelText(
      "settings:cliProxyApi.managementKeyLabel",
    )

    fireEvent.change(input, {
      target: { value: "  next-secret-key  " },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateCliProxyApiManagementKey).toHaveBeenCalledWith(
        "next-secret-key",
        expect.objectContaining({
          expectedLastUpdated: 1,
        }),
      )
    })

    await waitFor(() => {
      expect(listAllCliProxyApiProviders).toHaveBeenCalledWith({
        baseUrl: "http://localhost:8317/v0/management",
        adminToken: "next-secret-key",
      })
    })

    expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      "settings:cliProxyApi.managementKeyLabel",
    )
    expect(vi.mocked(showResultToast)).toHaveBeenCalledWith({
      success: false,
      message: "messages:cliProxyApi.managementApiUnreachable",
    })
  })

  it("persists and verifies the management key on Enter", async () => {
    const updateCliProxyApiManagementKey = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    vi.mocked(listAllCliProxyApiProviders).mockResolvedValue([])
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyApiBaseUrl: "http://localhost:8317/v0/management",
      cliProxyApiManagementKey: "secret-key",
      updateCliProxyApiBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateCliProxyApiManagementKey,
      resetCliProxyApiConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    const input = screen.getByLabelText(
      "settings:cliProxyApi.managementKeyLabel",
    )
    fireEvent.change(input, { target: { value: "  enter-secret-key  " } })
    input.focus()
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => {
      expect(updateCliProxyApiManagementKey).toHaveBeenCalledWith(
        "enter-secret-key",
        expect.objectContaining({ expectedLastUpdated: 1 }),
      )
    })
    await waitFor(() => {
      expect(listAllCliProxyApiProviders).toHaveBeenCalledWith({
        baseUrl: "http://localhost:8317/v0/management",
        adminToken: "enter-secret-key",
      })
    })
  })

  it("uses localized labels for the management key visibility toggle", () => {
    renderSubject()

    const toggle = screen.getByRole("button", {
      name: "settings:cliProxyApi.showKey",
    })

    fireEvent.click(toggle)

    expect(
      screen.getByRole("button", {
        name: "settings:cliProxyApi.hideKey",
      }),
    ).toBeInTheDocument()
  })

  it("shows the returned connection-check result via toast", async () => {
    vi.mocked(listAllCliProxyApiProviders).mockRejectedValue(
      new Error("connection failed"),
    )

    renderSubject()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:cliProxyApi.checkConnectionAction",
      }),
    )

    await waitFor(() => {
      expect(showResultToast).toHaveBeenCalledWith({
        success: false,
        message: "messages:cliProxyApi.managementApiUnreachable",
      })
    })

    expect(listAllCliProxyApiProviders).toHaveBeenCalledWith({
      baseUrl: "http://localhost:8317/v0/management",
      adminToken: "secret-key",
    })
  })

  it("refreshes clean draft fields when the saved preferences snapshot changes", async () => {
    const updateCliProxyApiBaseUrl = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    const updateCliProxyApiManagementKey = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    let contextValue = {
      preferences: { lastUpdated: 1 },
      cliProxyApiBaseUrl: "http://localhost:8317/v0/management",
      cliProxyApiManagementKey: "secret-key",
      updateCliProxyApiBaseUrl,
      updateCliProxyApiManagementKey,
      resetCliProxyApiConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    }
    vi.mocked(useUserPreferencesContext).mockImplementation(
      () => contextValue as any,
    )

    const { rerender } = renderSubject()

    contextValue = {
      ...contextValue,
      preferences: { lastUpdated: 2 },
      cliProxyApiBaseUrl: "http://localhost:9000/v0/management",
      cliProxyApiManagementKey: "next-secret-key",
    }

    rerender(
      <I18nextProvider i18n={testI18n}>
        <CliProxyApiSettings />
      </I18nextProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("http://localhost:8317/v0/management"),
      ).toHaveValue("http://localhost:9000/v0/management")
      expect(screen.getByDisplayValue("next-secret-key")).toBeInTheDocument()
    })

    const baseUrlInput = screen.getByPlaceholderText(
      "http://localhost:8317/v0/management",
    )
    const managementKeyInput = screen.getByDisplayValue("next-secret-key")

    fireEvent.change(baseUrlInput, {
      target: { value: "http://localhost:9010/v0/management" },
    })
    fireEvent.blur(baseUrlInput)

    fireEvent.change(managementKeyInput, {
      target: { value: "post-refresh-secret" },
    })
    fireEvent.blur(managementKeyInput)

    await waitFor(() => {
      expect(updateCliProxyApiBaseUrl).toHaveBeenLastCalledWith(
        "http://localhost:9010/v0/management",
        expect.objectContaining({
          expectedLastUpdated: 2,
        }),
      )
      expect(updateCliProxyApiManagementKey).toHaveBeenLastCalledWith(
        "post-refresh-secret",
        expect.objectContaining({
          expectedLastUpdated: 2,
        }),
      )
    })
  })
})
