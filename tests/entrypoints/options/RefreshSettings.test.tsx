import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import toast from "react-hot-toast"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import RefreshSettings from "~/entrypoints/options/pages/BasicSettings/components/RefreshSettings"
import { testI18n } from "~/tests/test-utils/i18n"
import {
  ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS,
  ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
  DEFAULT_ACCOUNT_AUTO_REFRESH,
} from "~/types/accountAutoRefresh"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/toastHelpers", () => ({
  showUpdateToast: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn() },
}))

describe("RefreshSettings (min refresh interval)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderSubject = () =>
    render(
      <I18nextProvider i18n={testI18n}>
        <RefreshSettings />
      </I18nextProvider>,
    )

  it("accepts values greater than 300 seconds (no max cap)", async () => {
    const updateMinRefreshInterval = vi.fn().mockResolvedValue(true)
    const updateRefreshInterval = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      autoRefresh: true,
      refreshOnOpen: true,
      refreshInterval: 360,
      minRefreshInterval: 60,
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      String(DEFAULT_ACCOUNT_AUTO_REFRESH.minInterval),
    )
    fireEvent.change(input, { target: { value: "301" } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateMinRefreshInterval).toHaveBeenCalledWith(301)
    })
    expect(vi.mocked(toast).error).not.toHaveBeenCalled()
  })

  it("rejects values below the minimum", async () => {
    const updateMinRefreshInterval = vi.fn().mockResolvedValue(true)
    const updateRefreshInterval = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      autoRefresh: true,
      refreshOnOpen: true,
      refreshInterval: 360,
      minRefreshInterval: 60,
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      String(DEFAULT_ACCOUNT_AUTO_REFRESH.minInterval),
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: "0" } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(vi.mocked(toast).error).toHaveBeenCalled()
    })
    expect(updateMinRefreshInterval).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(input.value).toBe("60")
    })
  })

  it("accepts the minimum value", async () => {
    const updateMinRefreshInterval = vi.fn().mockResolvedValue(true)
    const updateRefreshInterval = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      autoRefresh: true,
      refreshOnOpen: true,
      refreshInterval: 360,
      minRefreshInterval: 60,
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      String(DEFAULT_ACCOUNT_AUTO_REFRESH.minInterval),
    )
    fireEvent.change(input, {
      target: { value: String(ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS) },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateMinRefreshInterval).toHaveBeenCalledWith(
        ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
      )
    })
    expect(vi.mocked(toast).error).not.toHaveBeenCalled()
  })

  it("rejects refresh interval values below the minimum", async () => {
    const updateMinRefreshInterval = vi.fn().mockResolvedValue(true)
    const updateRefreshInterval = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      autoRefresh: true,
      refreshOnOpen: true,
      refreshInterval: 360,
      minRefreshInterval: 60,
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      String(DEFAULT_ACCOUNT_AUTO_REFRESH.interval),
    ) as HTMLInputElement

    fireEvent.change(input, {
      target: { value: String(ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS - 1) },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(vi.mocked(toast).error).toHaveBeenCalled()
    })
    expect(updateRefreshInterval).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(input.value).toBe("360")
    })
  })

  it("accepts refresh interval values at the minimum", async () => {
    const updateMinRefreshInterval = vi.fn().mockResolvedValue(true)
    const updateRefreshInterval = vi.fn().mockResolvedValue(true)
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      autoRefresh: true,
      refreshOnOpen: true,
      refreshInterval: 360,
      minRefreshInterval: 60,
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    } as any)

    renderSubject()

    const input = screen.getByPlaceholderText(
      String(DEFAULT_ACCOUNT_AUTO_REFRESH.interval),
    )

    fireEvent.change(input, {
      target: { value: String(ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS) },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(updateRefreshInterval).toHaveBeenCalledWith(
        ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS,
      )
    })
    expect(vi.mocked(toast).error).not.toHaveBeenCalled()
  })
})
