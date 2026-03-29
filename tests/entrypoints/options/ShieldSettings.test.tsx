import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ShieldSettings from "~/features/BasicSettings/components/tabs/Refresh/ShieldSettings"

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

    render(<ShieldSettings />)

    expect(
      await screen.findByText("refresh.shieldPermissionWarningTitle"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "refresh.shieldPermissionAction" }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "permissions.actions.refresh" }),
    )

    expect(openSettingsTabMock).toHaveBeenCalledWith("permissions")
    expect(canUseTempWindowFetchMock).toHaveBeenCalledTimes(2)
  })

  it("updates fallback methods and contexts, including the firefox-specific branch", async () => {
    isProtectionBypassFirefoxEnvMock.mockReturnValue(true)

    render(<ShieldSettings />)

    expect(
      await screen.findByText("refresh.shieldPopupFirefoxNote"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "refresh.shieldMethodTab" }),
    )
    fireEvent.click(screen.getAllByRole("checkbox")[1])
    fireEvent.click(screen.getAllByRole("checkbox")[2])
    fireEvent.click(screen.getAllByRole("checkbox")[3])

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
})
