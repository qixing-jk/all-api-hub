import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CheckinRedeemTab from "~/features/BasicSettings/components/tabs/CheckinRedeem/CheckinRedeemTab"
import NewApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/NewApiSettings"
import WebAiApiCheckTab from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheckTab"
import { SITE_ROUTE_KINDS } from "~/services/accounts/utils/siteRouteResolver"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const {
  createTabMock,
  mockedUseUserPreferencesContext,
  resolveAccountSiteRouteUrlMock,
  showUpdateToastMock,
} = vi.hoisted(() => ({
  createTabMock: vi.fn(),
  mockedUseUserPreferencesContext: vi.fn(),
  resolveAccountSiteRouteUrlMock: vi.fn(),
  showUpdateToastMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    createTab: createTabMock,
  }
})

vi.mock("~/services/accounts/utils/siteRouteResolver", () => ({
  SITE_ROUTE_KINDS: {
    AdminCredentials: "adminCredentials",
  },
  resolveAccountSiteRouteUrl: resolveAccountSiteRouteUrlMock,
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
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
  preferences: { lastUpdated: 1 },
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

describe("BasicSettings tab layout", () => {
  beforeEach(() => {
    createTabMock.mockReset()
    mockedUseUserPreferencesContext.mockReset()
    resolveAccountSiteRouteUrlMock.mockReset()
    resolveAccountSiteRouteUrlMock.mockResolvedValue(
      "https://managed.example/profile",
    )
    showUpdateToastMock.mockReset()
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  it("keeps WebAiApiCheck out of CheckinRedeemTab", () => {
    render(<CheckinRedeemTab />)

    expect(screen.getByTestId("auto-checkin-settings")).toBeInTheDocument()
    expect(screen.getByTestId("redemption-assist-settings")).toBeInTheDocument()
    expect(
      screen.queryByTestId("web-ai-api-check-settings"),
    ).not.toBeInTheDocument()
  })

  it("renders WebAiApiCheckSettings inside WebAiApiCheckTab", () => {
    render(<WebAiApiCheckTab />)

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

    render(<NewApiSettings />)

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

    fireEvent.change(usernameInput, { target: { value: " next-admin " } })
    fireEvent.blur(usernameInput)
    fireEvent.change(passwordInput, { target: { value: " next-password " } })
    fireEvent.blur(passwordInput)
    fireEvent.change(totpInput, {
      target: { value: " JBSWY3DPEHPK3PXQ " },
    })
    fireEvent.blur(totpInput)

    await waitFor(() =>
      expect(contextValue.updateNewApiUsername).toHaveBeenCalledWith(
        "next-admin",
        {
          expectedLastUpdated: 1,
        },
      ),
    )
    await waitFor(() =>
      expect(contextValue.updateNewApiPassword).toHaveBeenCalledWith(
        " next-password ",
        {
          expectedLastUpdated: 1,
        },
      ),
    )
    await waitFor(() =>
      expect(contextValue.updateNewApiTotpSecret).toHaveBeenCalledWith(
        "JBSWY3DPEHPK3PXQ",
        {
          expectedLastUpdated: 1,
        },
      ),
    )
  })

  it("persists New API base URL, admin token, and numeric user ID changes with the current snapshot version", async () => {
    const user = userEvent.setup()
    const contextValue = createContextValue({
      newApiUserId: "10",
    })
    mockedUseUserPreferencesContext.mockReturnValue(contextValue)

    render(<NewApiSettings />)

    const baseUrlInput = screen.getByPlaceholderText(
      "settings:newApi.fields.baseUrlPlaceholder",
    )
    const adminTokenInput = screen.getByDisplayValue("managed-admin-token")
    const userIdInput = screen.getByDisplayValue("10")

    fireEvent.change(baseUrlInput, {
      target: { value: "https://managed-next.example" },
    })
    fireEvent.blur(baseUrlInput)

    fireEvent.change(adminTokenInput, {
      target: { value: "next-admin-token" },
    })
    fireEvent.blur(adminTokenInput)

    fireEvent.change(userIdInput, {
      target: { value: " 42 " },
    })
    fireEvent.blur(userIdInput)

    await waitFor(() => {
      expect(contextValue.updateNewApiBaseUrl).toHaveBeenCalledWith(
        "https://managed-next.example",
        {
          expectedLastUpdated: 1,
        },
      )
      expect(contextValue.updateNewApiAdminToken).toHaveBeenCalledWith(
        "next-admin-token",
        {
          expectedLastUpdated: 1,
        },
      )
      expect(contextValue.updateNewApiUserId).toHaveBeenCalledWith("42", {
        expectedLastUpdated: 1,
      })
    })

    await user.click(
      screen.getByRole("button", {
        name: "settings:newApi.fields.showToken",
      }),
    )

    expect(adminTokenInput).toHaveAttribute("type", "text")
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      true,
      "settings:newApi.fields.baseUrlLabel",
    )
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      true,
      "settings:newApi.fields.adminTokenLabel",
    )
    expect(showUpdateToastMock).toHaveBeenCalledWith(
      true,
      "settings:newApi.fields.userIdLabel",
    )
  })

  it("opens the New API admin credentials page through the theme-aware route resolver", async () => {
    const user = userEvent.setup()
    const contextValue = createContextValue({
      newApiBaseUrl: "https://managed-new-api.example",
    })
    mockedUseUserPreferencesContext.mockReturnValue(contextValue)

    render(<NewApiSettings />)

    await user.click(
      screen.getByRole("button", {
        name: "settings:newApi.adminCredentialsLink.open",
      }),
    )

    await waitFor(() =>
      expect(resolveAccountSiteRouteUrlMock).toHaveBeenCalledWith(
        {
          baseUrl: "https://managed-new-api.example",
          siteType: SITE_TYPES.NEW_API,
        },
        SITE_ROUTE_KINDS.AdminCredentials,
      ),
    )
    expect(createTabMock).toHaveBeenCalledWith(
      "https://managed.example/profile",
      true,
    )
  })

  it("skips persisting unchanged New API draft values after blur", () => {
    const contextValue = createContextValue()
    mockedUseUserPreferencesContext.mockReturnValue(contextValue)

    render(<NewApiSettings />)

    fireEvent.blur(
      screen.getByPlaceholderText("settings:newApi.fields.baseUrlPlaceholder"),
    )
    fireEvent.blur(screen.getByDisplayValue("managed-admin-token"))

    const userIdInput = screen.getByDisplayValue("1")
    fireEvent.change(userIdInput, {
      target: { value: " 1 " },
    })
    fireEvent.blur(userIdInput)

    const usernameInput = screen.getByPlaceholderText(
      "settings:newApi.fields.usernamePlaceholder",
    )
    fireEvent.change(usernameInput, {
      target: { value: " admin " },
    })
    fireEvent.blur(usernameInput)

    fireEvent.blur(screen.getByDisplayValue("secret-password"))

    const totpInput = screen.getByPlaceholderText(
      "settings:newApi.fields.totpSecretPlaceholder",
    )
    fireEvent.change(totpInput, {
      target: { value: " JBSWY3DPEHPK3PXP " },
    })
    fireEvent.blur(totpInput)

    expect(contextValue.updateNewApiBaseUrl).not.toHaveBeenCalled()
    expect(contextValue.updateNewApiAdminToken).not.toHaveBeenCalled()
    expect(contextValue.updateNewApiUserId).not.toHaveBeenCalled()
    expect(contextValue.updateNewApiUsername).not.toHaveBeenCalled()
    expect(contextValue.updateNewApiPassword).not.toHaveBeenCalled()
    expect(contextValue.updateNewApiTotpSecret).not.toHaveBeenCalled()
    expect(showUpdateToastMock).not.toHaveBeenCalled()
  })

  it("resets the New API settings section through the shared SettingSection flow", async () => {
    const user = userEvent.setup()
    const contextValue = createContextValue()
    mockedUseUserPreferencesContext.mockReturnValue(contextValue)

    render(<NewApiSettings />)

    const section = screen.getByText("settings:newApi.title").closest("section")
    expect(section).toBeTruthy()

    await user.click(
      within(section!).getByRole("button", {
        name: "common:actions.reset",
      }),
    )

    const dialog = await screen.findByRole("dialog")
    await user.click(
      within(dialog).getByRole("button", {
        name: "common:actions.reset",
      }),
    )

    await waitFor(() =>
      expect(contextValue.resetNewApiConfig).toHaveBeenCalledTimes(1),
    )
  })

  it("shows an inline error and skips persisting a non-numeric New API admin user ID", async () => {
    const contextValue = createContextValue({
      newApiUserId: "101",
    })
    mockedUseUserPreferencesContext.mockReturnValue(contextValue)

    render(<NewApiSettings />)

    const userIdInput = screen.getByDisplayValue("101")

    fireEvent.change(userIdInput, { target: { value: "abc" } })
    fireEvent.blur(userIdInput)

    expect(contextValue.updateNewApiUserId).not.toHaveBeenCalled()
    expect(
      await screen.findByText("messages:errors.validation.userIdNumeric"),
    ).toBeInTheDocument()
    expect(showUpdateToastMock).not.toHaveBeenCalled()
  })
})
