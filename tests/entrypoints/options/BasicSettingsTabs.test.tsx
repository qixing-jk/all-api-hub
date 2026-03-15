import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CheckinRedeemTab from "~/features/BasicSettings/components/tabs/CheckinRedeem/CheckinRedeemTab"
import NewApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/NewApiSettings"
import WebAiApiCheckTab from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckTab"
import { testI18n } from "~~/tests/test-utils/i18n"

const { mockedUseUserPreferencesContext, showUpdateToastMock } = vi.hoisted(
  () => ({
    mockedUseUserPreferencesContext: vi.fn(),
    showUpdateToastMock: vi.fn(),
  }),
)

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("~/contexts/UserPreferencesContext")
  >("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
  }
})

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: (...args: unknown[]) => showUpdateToastMock(...args),
}))

vi.mock(
  "~/features/BasicSettings/components/tabs/CheckinRedeem/AutoCheckinSettings",
  () => ({
    default: () => <div data-testid="auto-checkin-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/CheckinRedeem/RedemptionAssistSettings",
  () => ({
    default: () => <div data-testid="redemption-assist-settings" />,
  }),
)

vi.mock(
  "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckSettings",
  () => ({
    default: () => <div data-testid="web-ai-api-check-settings" />,
  }),
)

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  newApiBaseUrl: "https://managed.example",
  newApiAdminToken: "managed-admin-token",
  newApiUserId: "1",
  newApiUsername: "admin",
  newApiPassword: "secret-password",
  newApiTotpSecret: "JBSWY3DPEHPK3PXP",
  updateNewApiBaseUrl: vi.fn().mockResolvedValue(true),
  updateNewApiAdminToken: vi.fn().mockResolvedValue(true),
  updateNewApiUserId: vi.fn().mockResolvedValue(true),
  updateNewApiUsername: vi.fn().mockResolvedValue(true),
  updateNewApiPassword: vi.fn().mockResolvedValue(true),
  updateNewApiTotpSecret: vi.fn().mockResolvedValue(true),
  resetNewApiConfig: vi.fn().mockResolvedValue(true),
  ...overrides,
})

const renderWithI18n = (ui: ReactNode) =>
  render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)

describe("BasicSettings tab layout", () => {
  beforeEach(() => {
    mockedUseUserPreferencesContext.mockReset()
    showUpdateToastMock.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("keeps WebAiApiCheck out of CheckinRedeemTab", () => {
    renderWithI18n(<CheckinRedeemTab />)

    expect(screen.getByTestId("auto-checkin-settings")).toBeInTheDocument()
    expect(screen.getByTestId("redemption-assist-settings")).toBeInTheDocument()
    expect(
      screen.queryByTestId("web-ai-api-check-settings"),
    ).not.toBeInTheDocument()
  })

  it("renders WebAiApiCheckSettings inside WebAiApiCheckTab", () => {
    renderWithI18n(<WebAiApiCheckTab />)

    expect(screen.getByTestId("web-ai-api-check-settings")).toBeInTheDocument()
    expect(
      screen.queryByTestId("auto-checkin-settings"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("redemption-assist-settings"),
    ).not.toBeInTheDocument()
  })

  it("renders masked New API login-assist fields and persists them on blur", async () => {
    const user = userEvent.setup()
    const contextValue = createContextValue()
    mockedUseUserPreferencesContext.mockReturnValue(contextValue)

    renderWithI18n(<NewApiSettings />)

    const usernameInput = screen.getByPlaceholderText(
      "settings:newApi.fields.usernamePlaceholder",
    )
    const passwordInput = screen.getByPlaceholderText(
      "settings:newApi.fields.passwordPlaceholder",
    )
    const totpInput = screen.getByPlaceholderText(
      "settings:newApi.fields.totpSecretPlaceholder",
    )

    expect(passwordInput).toHaveAttribute("type", "password")
    expect(totpInput).toHaveAttribute("type", "password")

    await user.click(
      screen.getByRole("button", {
        name: "settings:newApi.fields.showPassword",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "settings:newApi.fields.showTotpSecret",
      }),
    )

    expect(passwordInput).toHaveAttribute("type", "text")
    expect(totpInput).toHaveAttribute("type", "text")

    fireEvent.change(usernameInput, { target: { value: "next-admin" } })
    fireEvent.blur(usernameInput)
    fireEvent.change(passwordInput, { target: { value: "next-password" } })
    fireEvent.blur(passwordInput)
    fireEvent.change(totpInput, { target: { value: "JBSWY3DPEHPK3PXQ" } })
    fireEvent.blur(totpInput)

    await waitFor(() =>
      expect(contextValue.updateNewApiUsername).toHaveBeenCalledWith(
        "next-admin",
      ),
    )
    await waitFor(() =>
      expect(contextValue.updateNewApiPassword).toHaveBeenCalledWith(
        "next-password",
      ),
    )
    await waitFor(() =>
      expect(contextValue.updateNewApiTotpSecret).toHaveBeenCalledWith(
        "JBSWY3DPEHPK3PXQ",
      ),
    )
  })

  it("resets the New API settings section through the shared SettingSection flow", async () => {
    const user = userEvent.setup()
    const contextValue = createContextValue()
    mockedUseUserPreferencesContext.mockReturnValue(contextValue)

    renderWithI18n(<NewApiSettings />)

    const resetButtons = screen.getAllByRole("button", {
      name: "common:actions.reset",
    })
    await user.click(resetButtons[0]!)

    const confirmButtons = await screen.findAllByRole("button", {
      name: "common:actions.reset",
    })
    await user.click(confirmButtons[1]!)

    await waitFor(() =>
      expect(contextValue.resetNewApiConfig).toHaveBeenCalledTimes(1),
    )
  })
})
