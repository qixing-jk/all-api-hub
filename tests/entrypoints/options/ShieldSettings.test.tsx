import { beforeEach, describe, expect, it, vi } from "vitest"

import ShieldSettings from "~/features/BasicSettings/components/tabs/Refresh/ShieldSettings"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  canUseTempWindowFetchMock,
  getProtectionBypassUiVariantMock,
  isProtectionBypassFirefoxEnvMock,
  openSettingsTabMock,
  useUserPreferencesContextMock,
} = vi.hoisted(() => ({
  canUseTempWindowFetchMock: vi.fn(),
  getProtectionBypassUiVariantMock: vi.fn(),
  isProtectionBypassFirefoxEnvMock: vi.fn(),
  openSettingsTabMock: vi.fn(),
  useUserPreferencesContextMock: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => useUserPreferencesContextMock(),
  }
})

vi.mock("~/utils/browser/protectionBypass", () => ({
  ProtectionBypassUiVariants: {
    TempWindowOnly: "tempWindowOnly",
    TempWindowWithCookieInterceptor: "tempWindowWithCookieInterceptor",
  },
  getProtectionBypassUiVariant: () => getProtectionBypassUiVariantMock(),
  isProtectionBypassFirefoxEnv: () => isProtectionBypassFirefoxEnvMock(),
}))

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  canUseTempWindowFetch: () => canUseTempWindowFetchMock(),
}))

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openSettingsTab: (...args: unknown[]) => openSettingsTabMock(...args),
  }
})

describe("ShieldSettings", () => {
  const updateTempWindowFallback = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    canUseTempWindowFetchMock.mockResolvedValue(true)
    getProtectionBypassUiVariantMock.mockReturnValue(
      "tempWindowWithCookieInterceptor",
    )
    isProtectionBypassFirefoxEnvMock.mockReturnValue(false)
    useUserPreferencesContextMock.mockReturnValue({
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: true,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: true,
        tempContextMode: "composite",
      },
      updateTempWindowFallback,
    })
  })

  it("shows the permission warning when temp-window access is unavailable", async () => {
    canUseTempWindowFetchMock.mockResolvedValue(false)

    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("settings:refresh.shieldPermissionWarningTitle"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:refresh.shieldPermissionAction",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:permissions.actions.refresh",
      }),
    )

    expect(openSettingsTabMock).toHaveBeenCalledWith("permissions", {
      preserveHistory: true,
    })
    expect(canUseTempWindowFetchMock).toHaveBeenCalledTimes(2)
  })

  it("updates fallback methods and contexts, including the firefox-specific branch", async () => {
    isProtectionBypassFirefoxEnvMock.mockReturnValue(true)

    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findByText("settings:refresh.shieldPopupFirefoxNote"),
    ).toBeInTheDocument()

    const tabModeButton = screen.getByRole("button", {
      name: "settings:refresh.shieldMethodTab",
    })
    await waitFor(() => {
      expect(tabModeButton).toBeEnabled()
    })

    fireEvent.click(tabModeButton)

    const [, sidePanelCheckbox, optionsCheckbox, autoRefreshCheckbox] =
      screen.getAllByRole("checkbox")

    await waitFor(() => {
      expect(sidePanelCheckbox).toBeEnabled()
      expect(optionsCheckbox).toBeEnabled()
      expect(autoRefreshCheckbox).toBeEnabled()
    })

    fireEvent.click(sidePanelCheckbox)
    fireEvent.click(optionsCheckbox)
    fireEvent.click(autoRefreshCheckbox)

    await waitFor(() => {
      expect(updateTempWindowFallback).toHaveBeenCalledWith({
        tempContextMode: "tab",
      })
    })
    expect(updateTempWindowFallback).toHaveBeenCalledWith({
      useInSidePanel: false,
    })
    expect(updateTempWindowFallback).toHaveBeenCalledWith({
      useInOptions: false,
    })
    expect(updateTempWindowFallback).toHaveBeenCalledWith({
      useForAutoRefresh: false,
    })
  })

  it("lets shield method buttons wrap inside narrow settings cards", async () => {
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const tabModeButton = await screen.findByRole("button", {
      name: "settings:refresh.shieldMethodTab",
    })
    const methodGroup = tabModeButton.parentElement

    expect(methodGroup).toHaveClass(
      "flex",
      "w-full",
      "flex-wrap",
      "[@container(min-width:42rem)]:w-auto",
    )
    expect(tabModeButton).toHaveClass(
      "min-w-fit",
      "flex-1",
      "[@container(min-width:42rem)]:flex-none",
    )
  })
})
