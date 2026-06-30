import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import CliProxySettings from "~/features/BasicSettings/components/tabs/CliProxy/CliProxySettings"
import { verifyCliProxyManagementConnection } from "~/services/integrations/cliProxyService"
import { showResultToast, showUpdateToast } from "~/utils/core/toastHelpers"
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

vi.mock("~/services/integrations/cliProxyService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/integrations/cliProxyService")
    >()
  return {
    ...actual,
    verifyCliProxyManagementConnection: vi.fn(),
  }
})

vi.mock("~/utils/core/toastHelpers", () => ({
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
  showResultToast: showResultToastMock,
  showUpdateToast: showUpdateToastMock,
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

describe("CliProxySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyBaseUrl: "http://localhost:8317/v0/management",
      cliProxyManagementKey: "secret-key",
      updateCliProxyBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateCliProxyManagementKey: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetCliProxyConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    vi.mocked(verifyCliProxyManagementConnection).mockResolvedValue({
      success: true,
      message: "messages:cliproxy.managementApiConnectionSuccess",
    })
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <CliProxySettings />
      </I18nextProvider>,
    )

  it("trims the base URL before persisting and re-checks the connection", async () => {
    const updateCliProxyBaseUrl = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyBaseUrl: "http://localhost:8317/v0/management",
      cliProxyManagementKey: "secret-key",
      updateCliProxyBaseUrl,
      updateCliProxyManagementKey: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetCliProxyConfig: vi
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
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateCliProxyBaseUrl).toHaveBeenCalledWith(
        "http://localhost:9000/v0/management",
        expect.objectContaining({
          expectedLastUpdated: 1,
        }),
      )
    })

    await waitFor(() => {
      expect(verifyCliProxyManagementConnection).toHaveBeenCalledWith({
        baseUrl: "http://localhost:9000/v0/management",
        managementKey: "secret-key",
      })
    })

    expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      "settings:cliProxy.baseUrlLabel",
    )
    expect(vi.mocked(showResultToast)).toHaveBeenCalledWith({
      success: true,
      message: "messages:cliproxy.managementApiConnectionSuccess",
    })
  })

  it("shows stale preference guidance instead of a generic update failure", async () => {
    const updateCliProxyBaseUrl = vi
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
      cliProxyBaseUrl: "http://localhost:8317/v0/management",
      cliProxyManagementKey: "secret-key",
      updateCliProxyBaseUrl,
      updateCliProxyManagementKey: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      resetCliProxyConfig: vi
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

    expect(updateCliProxyBaseUrl).toHaveBeenCalledWith(
      "http://localhost:9000/v0/management",
      expect.objectContaining({
        expectedLastUpdated: 1,
      }),
    )
    expect(vi.mocked(showUpdateToast)).not.toHaveBeenCalled()
    expect(verifyCliProxyManagementConnection).not.toHaveBeenCalled()
  })

  it("trims the management key before persisting and surfaces the connection-check result", async () => {
    const updateCliProxyManagementKey = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    vi.mocked(verifyCliProxyManagementConnection).mockResolvedValue({
      success: false,
      message: "messages:toast.error.operationFailedGeneric",
    })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyBaseUrl: "http://localhost:8317/v0/management",
      cliProxyManagementKey: "secret-key",
      updateCliProxyBaseUrl: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
      updateCliProxyManagementKey,
      resetCliProxyConfig: vi
        .fn()
        .mockResolvedValue({ ok: true, preferences: {} }),
    } as any)

    renderSubject()

    const input = screen.getByDisplayValue("secret-key")

    fireEvent.change(input, {
      target: { value: "  next-secret-key  " },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateCliProxyManagementKey).toHaveBeenCalledWith(
        "next-secret-key",
        expect.objectContaining({
          expectedLastUpdated: 1,
        }),
      )
    })

    await waitFor(() => {
      expect(verifyCliProxyManagementConnection).toHaveBeenCalledWith({
        baseUrl: "http://localhost:8317/v0/management",
        managementKey: "next-secret-key",
      })
    })

    expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      "settings:cliProxy.managementKeyLabel",
    )
    expect(vi.mocked(showResultToast)).toHaveBeenCalledWith({
      success: false,
      message: "messages:toast.error.operationFailedGeneric",
    })
  })

  it("uses localized labels for the management key visibility toggle", () => {
    renderSubject()

    const toggle = screen.getByRole("button", {
      name: "settings:cliProxy.showKey",
    })

    fireEvent.click(toggle)

    expect(
      screen.getByRole("button", {
        name: "settings:cliProxy.hideKey",
      }),
    ).toBeInTheDocument()
  })

  it("shows the returned connection-check result via toast", async () => {
    vi.mocked(verifyCliProxyManagementConnection).mockResolvedValue({
      success: false,
      message: "messages:cliproxy.managementApiRemoteAccessDisabled",
    })

    renderSubject()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:cliProxy.checkConnectionAction",
      }),
    )

    await waitFor(() => {
      expect(showResultToast).toHaveBeenCalledWith({
        success: false,
        message: "messages:cliproxy.managementApiRemoteAccessDisabled",
      })
    })

    expect(verifyCliProxyManagementConnection).toHaveBeenCalledWith({
      baseUrl: "http://localhost:8317/v0/management",
      managementKey: "secret-key",
    })
  })

  it("refreshes clean draft fields when the saved preferences snapshot changes", async () => {
    const updateCliProxyBaseUrl = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    const updateCliProxyManagementKey = vi
      .fn()
      .mockResolvedValue({ ok: true, preferences: {} })
    let contextValue = {
      preferences: { lastUpdated: 1 },
      cliProxyBaseUrl: "http://localhost:8317/v0/management",
      cliProxyManagementKey: "secret-key",
      updateCliProxyBaseUrl,
      updateCliProxyManagementKey,
      resetCliProxyConfig: vi
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
      cliProxyBaseUrl: "http://localhost:9000/v0/management",
      cliProxyManagementKey: "next-secret-key",
    }

    rerender(
      <I18nextProvider i18n={testI18n}>
        <CliProxySettings />
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
      expect(updateCliProxyBaseUrl).toHaveBeenLastCalledWith(
        "http://localhost:9010/v0/management",
        expect.objectContaining({
          expectedLastUpdated: 2,
        }),
      )
      expect(updateCliProxyManagementKey).toHaveBeenLastCalledWith(
        "post-refresh-secret",
        expect.objectContaining({
          expectedLastUpdated: 2,
        }),
      )
    })
  })
})
