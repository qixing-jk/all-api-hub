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
    updateTempWindowFallback.mockResolvedValue({ ok: true })
    canUseTempWindowFetchMock.mockResolvedValue(true)
    getProtectionBypassUiVariantMock.mockReturnValue(
      "tempWindowWithCookieInterceptor",
    )
    isProtectionBypassFirefoxEnvMock.mockReturnValue(false)
    useUserPreferencesContextMock.mockReturnValue({
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: {
          account_refresh: true,
          balance_history: true,
          checkin: true,
          redemption_assist: true,
          ldoh_site_lookup: true,
          key_management: true,
          managed_site_channels: true,
          managed_site_model_sync: true,
        },
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

    expect(screen.getByRole("switch")).toBeEnabled()
    expect(
      screen.getByRole("button", {
        name: "settings:refresh.shieldMethodTab",
      }),
    ).toBeEnabled()
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeEnabled()
    }
  })

  it("keeps manual policy controls editable when automatic bypass is off", async () => {
    useUserPreferencesContextMock.mockReturnValue({
      tempWindowFallback: {
        enabled: false,
        automaticFeatureBypass: {
          account_refresh: true,
          balance_history: true,
          checkin: true,
          redemption_assist: true,
          ldoh_site_lookup: true,
          key_management: true,
          managed_site_channels: true,
          managed_site_model_sync: true,
        },
        tempContextMode: "composite",
      },
      updateTempWindowFallback,
    })

    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const method = await screen.findByRole("button", {
      name: "settings:refresh.shieldMethodTab",
    })
    const automaticFeatures = screen.getAllByRole("checkbox")

    expect(method).toBeEnabled()
    expect(automaticFeatures).toHaveLength(8)
    for (const feature of automaticFeatures) expect(feature).toBeEnabled()
  })

  it("updates fallback methods and complete automatic feature maps", async () => {
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const tabModeButton = screen.getByRole("button", {
      name: "settings:refresh.shieldMethodTab",
    })
    await waitFor(() => {
      expect(tabModeButton).toBeEnabled()
    })

    fireEvent.click(tabModeButton)

    const accountRefreshCheckbox = screen.getAllByRole("checkbox")[0]

    await waitFor(() => {
      expect(accountRefreshCheckbox).toBeEnabled()
    })

    fireEvent.click(accountRefreshCheckbox)

    await waitFor(() => {
      expect(updateTempWindowFallback).toHaveBeenCalledWith({
        tempContextMode: "tab",
      })
    })
    expect(updateTempWindowFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        automaticFeatureBypass: expect.objectContaining({
          account_refresh: false,
        }),
      }),
    )
  })

  it("keeps rapid automatic-feature changes in the latest complete map", async () => {
    render(<ShieldSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const [accountRefresh, balanceHistory] = screen.getAllByRole("checkbox")
    fireEvent.click(accountRefresh)
    fireEvent.click(balanceHistory)

    await waitFor(() => {
      expect(updateTempWindowFallback).toHaveBeenCalledTimes(2)
    })
    expect(updateTempWindowFallback).toHaveBeenLastCalledWith({
      automaticFeatureBypass: expect.objectContaining({
        account_refresh: false,
        balance_history: false,
      }),
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
