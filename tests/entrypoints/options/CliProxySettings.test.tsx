import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import CliProxySettings from "~/features/BasicSettings/components/tabs/CliProxy/CliProxySettings"
import { verifyCliProxyManagementConnection } from "~/services/integrations/cliProxyService"
import { showResultToast, showUpdateToast } from "~/utils/core/toastHelpers"
import { testI18n } from "~~/tests/test-utils/i18n"

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
  showResultToast: vi.fn(),
  showUpdateToast: vi.fn(),
}))

describe("CliProxySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyBaseUrl: "http://localhost:8317/v0/management",
      cliProxyManagementKey: "secret-key",
      updateCliProxyBaseUrl: vi.fn().mockResolvedValue(true),
      updateCliProxyManagementKey: vi.fn().mockResolvedValue(true),
      resetCliProxyConfig: vi.fn().mockResolvedValue(true),
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
    const updateCliProxyBaseUrl = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyBaseUrl: "http://localhost:8317/v0/management",
      cliProxyManagementKey: "secret-key",
      updateCliProxyBaseUrl,
      updateCliProxyManagementKey: vi.fn().mockResolvedValue(true),
      resetCliProxyConfig: vi.fn().mockResolvedValue(true),
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
        {
          expectedLastUpdated: 1,
        },
      )
    })

    await waitFor(() => {
      expect(verifyCliProxyManagementConnection).toHaveBeenCalledWith({
        baseUrl: "http://localhost:9000/v0/management",
        managementKey: "secret-key",
      })
    })

    expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
      true,
      "settings:cliProxy.baseUrlLabel",
    )
    expect(vi.mocked(showResultToast)).toHaveBeenCalledWith({
      success: true,
      message: "messages:cliproxy.managementApiConnectionSuccess",
    })
  })

  it("trims the management key before persisting and surfaces the connection-check result", async () => {
    const updateCliProxyManagementKey = vi.fn().mockResolvedValue(true)
    vi.mocked(verifyCliProxyManagementConnection).mockResolvedValue({
      success: false,
      message: "messages:toast.error.operationFailedGeneric",
    })
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences: { lastUpdated: 1 },
      cliProxyBaseUrl: "http://localhost:8317/v0/management",
      cliProxyManagementKey: "secret-key",
      updateCliProxyBaseUrl: vi.fn().mockResolvedValue(true),
      updateCliProxyManagementKey,
      resetCliProxyConfig: vi.fn().mockResolvedValue(true),
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
        {
          expectedLastUpdated: 1,
        },
      )
    })

    await waitFor(() => {
      expect(verifyCliProxyManagementConnection).toHaveBeenCalledWith({
        baseUrl: "http://localhost:8317/v0/management",
        managementKey: "next-secret-key",
      })
    })

    expect(vi.mocked(showUpdateToast)).toHaveBeenCalledWith(
      true,
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
    const updateCliProxyBaseUrl = vi.fn().mockResolvedValue(true)
    const updateCliProxyManagementKey = vi.fn().mockResolvedValue(true)
    let contextValue = {
      preferences: { lastUpdated: 1 },
      cliProxyBaseUrl: "http://localhost:8317/v0/management",
      cliProxyManagementKey: "secret-key",
      updateCliProxyBaseUrl,
      updateCliProxyManagementKey,
      resetCliProxyConfig: vi.fn().mockResolvedValue(true),
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
        {
          expectedLastUpdated: 2,
        },
      )
      expect(updateCliProxyManagementKey).toHaveBeenLastCalledWith(
        "post-refresh-secret",
        {
          expectedLastUpdated: 2,
        },
      )
    })
  })
})
