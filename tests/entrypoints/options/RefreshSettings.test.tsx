import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import RefreshSettings from "~/features/BasicSettings/components/tabs/Refresh/RefreshSettings"
import toast from "~/lib/notify"
import {
  ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS,
  ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
} from "~/types/accountAutoRefresh"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"
import { testI18n } from "~~/tests/test-utils/i18n"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: vi.fn(),
}))

vi.mock("~/utils/feedback/preferenceFeedback", () => ({
  showUpdateToast: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: { error: vi.fn() },
}))

type RefreshSettingsContext = Pick<
  ReturnType<typeof useUserPreferencesContext>,
  | "autoRefresh"
  | "refreshOnOpen"
  | "refreshInterval"
  | "minRefreshInterval"
  | "updateAutoRefresh"
  | "updateRefreshOnOpen"
  | "updateRefreshInterval"
  | "updateMinRefreshInterval"
  | "resetAutoRefreshConfig"
>

/** Only the preference fields read by this section belong in its test fixture. */
function mockRefreshPreferences(
  overrides: Partial<RefreshSettingsContext> & {
    preferences?: Pick<
      ReturnType<typeof useUserPreferencesContext>["preferences"],
      "lastUpdated"
    >
  } = {},
) {
  vi.mocked(useUserPreferencesContext).mockReturnValue({
    autoRefresh: true,
    refreshOnOpen: true,
    refreshInterval: 360,
    minRefreshInterval: 60,
    updateAutoRefresh: vi.fn(),
    updateRefreshOnOpen: vi.fn(),
    updateRefreshInterval: vi.fn(),
    updateMinRefreshInterval: vi.fn(),
    resetAutoRefreshConfig: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useUserPreferencesContext>)
}

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
    mockRefreshPreferences({
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    })

    renderSubject()

    const input = screen.getByRole("spinbutton", {
      name: "settings:refresh.minRefreshInterval",
    })
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
    mockRefreshPreferences({
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    })

    renderSubject()

    const input = screen.getByRole("spinbutton", {
      name: "settings:refresh.minRefreshInterval",
    }) as HTMLInputElement
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
    mockRefreshPreferences({
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    })

    renderSubject()

    const input = screen.getByRole("spinbutton", {
      name: "settings:refresh.minRefreshInterval",
    })
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
    mockRefreshPreferences({
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    })

    renderSubject()

    const input = screen.getByRole("spinbutton", {
      name: "settings:refresh.refreshInterval",
    }) as HTMLInputElement

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
    mockRefreshPreferences({
      updateAutoRefresh: vi.fn().mockResolvedValue(true),
      updateRefreshOnOpen: vi.fn().mockResolvedValue(true),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue(true),
    })

    renderSubject()

    const input = screen.getByRole("spinbutton", {
      name: "settings:refresh.refreshInterval",
    })

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

  it("shows result-aware feedback after toggling refresh on open", async () => {
    const writeResult = { ok: true as const }
    const updateRefreshOnOpen = vi.fn().mockResolvedValue(writeResult)
    mockRefreshPreferences({
      refreshOnOpen: false,
      updateAutoRefresh: vi.fn().mockResolvedValue({ ok: true }),
      updateRefreshOnOpen,
      updateRefreshInterval: vi.fn().mockResolvedValue({ ok: true }),
      updateMinRefreshInterval: vi.fn().mockResolvedValue({ ok: true }),
      resetAutoRefreshConfig: vi.fn().mockResolvedValue({ ok: true }),
    })

    renderSubject()

    fireEvent.click(
      atIndex(screen.getAllByRole("switch", { name: "Toggle" }), 1),
    )

    await waitFor(() => {
      expect(updateRefreshOnOpen).toHaveBeenCalledWith(true)
    })
    expect(showUpdateToast).toHaveBeenCalledWith(
      writeResult,
      "settings:refresh.refreshOnOpen",
    )
  })

  it("normalizes unchanged interval drafts without saving", async () => {
    const updateRefreshInterval = vi.fn().mockResolvedValue({ ok: true })
    const updateMinRefreshInterval = vi.fn().mockResolvedValue({ ok: true })
    mockRefreshPreferences({
      preferences: { lastUpdated: 1 },
      updateAutoRefresh: vi.fn().mockResolvedValue({ ok: true }),
      updateRefreshOnOpen: vi.fn().mockResolvedValue({ ok: true }),
      updateRefreshInterval,
      updateMinRefreshInterval,
      resetAutoRefreshConfig: vi.fn().mockResolvedValue({ ok: true }),
    })

    renderSubject()

    const refreshIntervalInput = screen.getByRole("spinbutton", {
      name: "settings:refresh.refreshInterval",
    })
    const minRefreshIntervalInput = screen.getByRole("spinbutton", {
      name: "settings:refresh.minRefreshInterval",
    })
    fireEvent.change(refreshIntervalInput, { target: { value: "0360" } })
    fireEvent.blur(refreshIntervalInput)
    fireEvent.change(minRefreshIntervalInput, { target: { value: "060" } })
    fireEvent.blur(minRefreshIntervalInput)

    await waitFor(() => {
      expect(refreshIntervalInput).toHaveValue(360)
      expect(minRefreshIntervalInput).toHaveValue(60)
    })
    expect(updateRefreshInterval).not.toHaveBeenCalled()
    expect(updateMinRefreshInterval).not.toHaveBeenCalled()
  })

  it("restores the saved refresh interval when persistence fails", async () => {
    const failedWrite = {
      ok: false as const,
      reason: {
        type: "storage-error" as const,
        error: new Error("write failed"),
      },
    }
    const updateRefreshInterval = vi.fn().mockResolvedValue(failedWrite)
    mockRefreshPreferences({
      preferences: { lastUpdated: 1 },
      updateAutoRefresh: vi.fn().mockResolvedValue({ ok: true }),
      updateRefreshOnOpen: vi.fn().mockResolvedValue({ ok: true }),
      updateRefreshInterval,
      updateMinRefreshInterval: vi.fn().mockResolvedValue({ ok: true }),
      resetAutoRefreshConfig: vi.fn().mockResolvedValue({ ok: true }),
    })

    renderSubject()

    const input = screen.getByRole("spinbutton", {
      name: "settings:refresh.refreshInterval",
    })
    fireEvent.change(input, { target: { value: "420" } })
    fireEvent.blur(input)

    await waitFor(() => expect(input).toHaveValue(360))
    expect(showUpdateToast).toHaveBeenCalledWith(
      failedWrite,
      "settings:refresh.refreshInterval",
    )
  })

  it.each([60, 300, 599])(
    "associates a non-alert hint with a valid frequent refresh interval of %i seconds",
    (interval) => {
      mockRefreshPreferences({
        refreshOnOpen: false,
        refreshInterval: interval,
      })

      renderSubject()

      expect(
        screen.getByRole("spinbutton", {
          name: "settings:refresh.refreshInterval",
        }),
      ).toHaveAccessibleDescription("settings:refresh.refreshIntervalHint")
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    },
  )

  it.each(["", "0", "59", "60.5", "600"])(
    "hides frequency guidance for draft %j",
    async (draft) => {
      const user = userEvent.setup()
      const updateRefreshInterval = vi.fn()
      mockRefreshPreferences({
        refreshOnOpen: false,
        refreshInterval: 300,
        updateRefreshInterval,
      })
      renderSubject()
      const input = screen.getByRole("spinbutton", {
        name: "settings:refresh.refreshInterval",
      })

      await user.clear(input)
      if (draft) await user.type(input, draft)

      expect(
        screen.queryByText("settings:refresh.refreshIntervalHint"),
      ).not.toBeInTheDocument()
      expect(input).not.toHaveAccessibleDescription()
      expect(updateRefreshInterval).not.toHaveBeenCalled()
    },
  )

  it("does not display low refresh interval warning when interval is >= 600s", () => {
    mockRefreshPreferences({
      refreshOnOpen: false,
      refreshInterval: 900,
    })

    renderSubject()

    expect(
      screen.queryByText("settings:refresh.refreshIntervalHint"),
    ).not.toBeInTheDocument()
  })

  it("does not display low refresh interval warning when auto refresh is disabled", () => {
    mockRefreshPreferences({
      autoRefresh: false,
      refreshOnOpen: false,
      refreshInterval: 300,
    })

    renderSubject()

    expect(
      screen.queryByText("settings:refresh.refreshIntervalHint"),
    ).not.toBeInTheDocument()
  })
})
