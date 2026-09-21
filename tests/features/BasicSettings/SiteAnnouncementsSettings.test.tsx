import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import SiteAnnouncementsSettings, {
  normalizeNotificationMaxAgeDaysInput,
  normalizePollingIntervalInput,
} from "~/features/BasicSettings/components/tabs/SiteAnnouncements/SiteAnnouncementsSettings"
import toast from "~/lib/notify"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  openOrFocusOptionsMenuItemMock,
  showUpdateToastMock,
  updateSiteAnnouncementNotificationsMock,
} = vi.hoisted(() => ({
  openOrFocusOptionsMenuItemMock: vi.fn(),
  showUpdateToastMock: vi.fn(),
  updateSiteAnnouncementNotificationsMock: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    preferences: null,
    siteAnnouncementNotifications: {
      enabled: true,
      notificationEnabled: true,
      intervalMinutes: 360,
      notificationMaxAgeDays:
        DEFAULT_PREFERENCES.siteAnnouncementNotifications!
          .notificationMaxAgeDays,
      autoMarkUpstreamReadOnNotify: false,
    },
    updateSiteAnnouncementNotifications:
      updateSiteAnnouncementNotificationsMock,
  }),
}))

vi.mock("~/utils/feedback/preferenceFeedback", () => ({
  showUpdateToast: (...args: unknown[]) => showUpdateToastMock(...args),
}))

vi.mock("~/utils/navigation", () => ({
  openOrFocusOptionsMenuItem: (...args: unknown[]) =>
    openOrFocusOptionsMenuItemMock(...args),
}))

vi.mock("~/lib/notify", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

describe("SiteAnnouncementNotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateSiteAnnouncementNotificationsMock.mockResolvedValue({ success: true })
  })

  it("resets polling defaults and its drafts without changing notification delivery", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    const intervalInput = screen.getByRole("spinbutton", {
      name: "settings:siteAnnouncementNotifications.polling.interval",
    })
    const maxAgeInput = screen.getByRole("spinbutton", {
      name: "settings:siteAnnouncementNotifications.polling.maxAge",
    })
    fireEvent.change(intervalInput, { target: { value: "720" } })
    fireEvent.change(maxAgeInput, { target: { value: "90" } })
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )
    const defaults = DEFAULT_PREFERENCES.siteAnnouncementNotifications!
    await waitFor(() => {
      expect(intervalInput).toHaveValue(defaults.intervalMinutes)
      expect(maxAgeInput).toHaveValue(defaults.notificationMaxAgeDays)
    })
    expect(
      updateSiteAnnouncementNotificationsMock,
    ).toHaveBeenCalledExactlyOnceWith({
      enabled: defaults.enabled,
      intervalMinutes: defaults.intervalMinutes,
      notificationMaxAgeDays: defaults.notificationMaxAgeDays,
      autoMarkUpstreamReadOnNotify: defaults.autoMarkUpstreamReadOnNotify,
    })
  })

  it("updates the polling preference through the preferences context", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const pollingItem = (
      await screen.findByText(
        "settings:siteAnnouncementNotifications.polling.enable",
      )
    ).closest('[id="site-announcement-notifications-enabled"]')
    const pollingSwitch = pollingItem?.querySelector(
      '[role="switch"]',
    ) as HTMLElement | null

    expect(pollingSwitch).not.toBeNull()

    fireEvent.click(pollingSwitch!)

    await waitFor(() => {
      expect(updateSiteAnnouncementNotificationsMock).toHaveBeenCalledWith({
        enabled: false,
      })
    })

    expect(showUpdateToastMock).toHaveBeenCalledWith(
      { success: true },
      "settings:siteAnnouncementNotifications.polling.enable",
    )
  })

  it("shows failure feedback when the polling preference update fails", async () => {
    updateSiteAnnouncementNotificationsMock.mockResolvedValue({
      success: false,
    })

    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const pollingItem = (
      await screen.findByText(
        "settings:siteAnnouncementNotifications.polling.enable",
      )
    ).closest('[id="site-announcement-notifications-enabled"]')
    const pollingSwitch = pollingItem?.querySelector(
      '[role="switch"]',
    ) as HTMLElement | null

    expect(pollingSwitch).not.toBeNull()
    expect(pollingSwitch).toHaveAttribute("aria-checked", "true")

    fireEvent.click(pollingSwitch!)

    await waitFor(() => {
      expect(updateSiteAnnouncementNotificationsMock).toHaveBeenCalledWith({
        enabled: false,
      })
    })

    expect(showUpdateToastMock).toHaveBeenCalledWith(
      { success: false },
      "settings:siteAnnouncementNotifications.polling.enable",
    )
    expect(pollingSwitch).toHaveAttribute("aria-checked", "true")
  })

  it("updates the notification age window through the preferences context", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const maxAgeInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.maxAge",
    )

    fireEvent.change(maxAgeInput, { target: { value: "14" } })
    fireEvent.blur(maxAgeInput)

    await waitFor(() => {
      expect(updateSiteAnnouncementNotificationsMock).toHaveBeenCalledWith({
        notificationMaxAgeDays: 14,
      })
    })

    expect(showUpdateToastMock).toHaveBeenCalledWith(
      { success: true },
      "settings:siteAnnouncementNotifications.polling.maxAge",
    )
  })

  it("rejects notification age windows outside the supported range", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const maxAgeInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.maxAge",
    )

    fireEvent.change(maxAgeInput, { target: { value: "0" } })
    fireEvent.blur(maxAgeInput)

    await waitFor(() =>
      expect(maxAgeInput).toHaveValue(
        DEFAULT_PREFERENCES.siteAnnouncementNotifications!
          .notificationMaxAgeDays,
      ),
    )
    expect(updateSiteAnnouncementNotificationsMock).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "settings:siteAnnouncementNotifications.polling.maxAgeInvalid",
    )
  })

  it("updates the upstream read opt-in through the preferences context", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const upstreamReadItem = (
      await screen.findByText(
        "settings:siteAnnouncementNotifications.polling.upstreamRead",
      )
    ).closest('[id="site-announcement-notifications-upstream-read"]')
    const upstreamReadSwitch = upstreamReadItem?.querySelector(
      '[role="switch"]',
    ) as HTMLElement | null

    expect(upstreamReadSwitch).not.toBeNull()
    expect(upstreamReadSwitch).toHaveAttribute("aria-checked", "false")

    fireEvent.click(upstreamReadSwitch!)

    await waitFor(() => {
      expect(updateSiteAnnouncementNotificationsMock).toHaveBeenCalledWith({
        autoMarkUpstreamReadOnNotify: true,
      })
    })

    expect(showUpdateToastMock).toHaveBeenCalledWith(
      { success: true },
      "settings:siteAnnouncementNotifications.polling.upstreamRead",
    )
  })

  it("opens the site announcements page from the quick link action", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    fireEvent.click(
      await screen.findByRole("button", {
        name: "settings:siteAnnouncementNotifications.page.open",
      }),
    )

    expect(openOrFocusOptionsMenuItemMock).toHaveBeenCalledWith(
      MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
    )
  })

  it("updates the polling interval through the preferences context", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    fireEvent.change(intervalInput, { target: { value: "120" } })
    fireEvent.blur(intervalInput)

    await waitFor(() => {
      expect(updateSiteAnnouncementNotificationsMock).toHaveBeenCalledWith({
        intervalMinutes: 120,
      })
    })

    expect(showUpdateToastMock).toHaveBeenCalledWith(
      { success: true },
      "settings:siteAnnouncementNotifications.polling.interval",
    )
  })

  it("uses normal one-minute steps for polling interval input", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    expect(intervalInput).toHaveAttribute("step", "1")
  })

  it("resets an invalid polling interval without saving", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    fireEvent.change(intervalInput, { target: { value: "" } })
    fireEvent.blur(intervalInput)

    await waitFor(() => {
      expect(intervalInput).toHaveValue(360)
    })

    expect(updateSiteAnnouncementNotificationsMock).not.toHaveBeenCalled()
    expect(showUpdateToastMock).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "settings:siteAnnouncementNotifications.polling.intervalInvalid",
    )
  })

  it("keeps the persisted polling interval without saving", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    fireEvent.change(intervalInput, { target: { value: "0360" } })
    fireEvent.blur(intervalInput)

    await waitFor(() => {
      expect(intervalInput).toHaveValue(360)
    })

    expect(updateSiteAnnouncementNotificationsMock).not.toHaveBeenCalled()
    expect(showUpdateToastMock).not.toHaveBeenCalled()
  })

  it("rejects polling intervals above the supported maximum", async () => {
    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    fireEvent.change(intervalInput, { target: { value: "9999" } })
    fireEvent.blur(intervalInput)

    await waitFor(() => expect(intervalInput).toHaveValue(360))
    expect(updateSiteAnnouncementNotificationsMock).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "settings:siteAnnouncementNotifications.polling.intervalInvalid",
    )
  })

  it("resets the polling interval input when the update fails", async () => {
    updateSiteAnnouncementNotificationsMock.mockResolvedValue({
      success: false,
    })

    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    fireEvent.change(intervalInput, { target: { value: "120" } })
    fireEvent.blur(intervalInput)

    await waitFor(() => {
      expect(updateSiteAnnouncementNotificationsMock).toHaveBeenCalledWith({
        intervalMinutes: 120,
      })
    })

    expect(showUpdateToastMock).toHaveBeenCalledWith(
      { success: false },
      "settings:siteAnnouncementNotifications.polling.interval",
    )
    expect(intervalInput).toHaveValue(360)
  })

  it("resets the polling interval input when the update rejects", async () => {
    updateSiteAnnouncementNotificationsMock.mockRejectedValue(
      new Error("runtime failed"),
    )

    render(<SiteAnnouncementsSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    fireEvent.change(intervalInput, { target: { value: "120" } })
    fireEvent.blur(intervalInput)

    await waitFor(() => {
      expect(updateSiteAnnouncementNotificationsMock).toHaveBeenCalledWith({
        intervalMinutes: 120,
      })
    })

    expect(showUpdateToastMock).toHaveBeenCalledWith(
      { success: false },
      "settings:siteAnnouncementNotifications.polling.interval",
    )
    expect(intervalInput).toHaveValue(360)
  })
})

describe("normalizePollingIntervalInput", () => {
  it("rejects non-finite numeric values", () => {
    expect(normalizePollingIntervalInput("Infinity")).toBeNull()
  })

  it("keeps whole-minute values without snapping to 15-minute steps", () => {
    expect(normalizePollingIntervalInput("16")).toBe(16)
  })

  it("rejects out-of-range and fractional minute values", () => {
    expect(normalizePollingIntervalInput("14")).toBeNull()
    expect(normalizePollingIntervalInput("1441")).toBeNull()
    expect(normalizePollingIntervalInput("15.5")).toBeNull()
  })

  it("accepts whole notification age days within the supported range", () => {
    expect(normalizeNotificationMaxAgeDaysInput("1")).toBe(1)
    expect(normalizeNotificationMaxAgeDaysInput("365")).toBe(365)
  })

  it("rejects out-of-range and fractional notification age values", () => {
    expect(normalizeNotificationMaxAgeDaysInput("0")).toBeNull()
    expect(normalizeNotificationMaxAgeDaysInput("366")).toBeNull()
    expect(normalizeNotificationMaxAgeDaysInput("7.5")).toBeNull()
    expect(normalizeNotificationMaxAgeDaysInput("")).toBeNull()
  })
})
