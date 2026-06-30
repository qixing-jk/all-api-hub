import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import SiteAnnouncementNotificationSettings, {
  normalizePollingIntervalInput,
} from "~/features/BasicSettings/components/tabs/General/SiteAnnouncementNotificationSettings"
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
    siteAnnouncementNotifications: {
      enabled: true,
      notificationEnabled: true,
      intervalMinutes: 360,
    },
    updateSiteAnnouncementNotifications:
      updateSiteAnnouncementNotificationsMock,
  }),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: (...args: unknown[]) => showUpdateToastMock(...args),
}))

vi.mock("~/utils/navigation", () => ({
  openOrFocusOptionsMenuItem: (...args: unknown[]) =>
    openOrFocusOptionsMenuItemMock(...args),
}))

describe("SiteAnnouncementNotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateSiteAnnouncementNotificationsMock.mockResolvedValue({ success: true })
  })

  it("updates the polling preference through the preferences context", async () => {
    render(<SiteAnnouncementNotificationSettings />, {
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

    render(<SiteAnnouncementNotificationSettings />, {
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

  it("opens the site announcements page from the quick link action", async () => {
    render(<SiteAnnouncementNotificationSettings />, {
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
    render(<SiteAnnouncementNotificationSettings />, {
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
    render(<SiteAnnouncementNotificationSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    expect(intervalInput).toHaveAttribute("step", "1")
  })

  it("resets an invalid polling interval without saving", async () => {
    render(<SiteAnnouncementNotificationSettings />, {
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
  })

  it("keeps the persisted polling interval without saving", async () => {
    render(<SiteAnnouncementNotificationSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    fireEvent.change(intervalInput, { target: { value: "360" } })
    fireEvent.blur(intervalInput)

    await waitFor(() => {
      expect(intervalInput).toHaveValue(360)
    })

    expect(updateSiteAnnouncementNotificationsMock).not.toHaveBeenCalled()
    expect(showUpdateToastMock).not.toHaveBeenCalled()
  })

  it("caps polling interval values above the supported maximum", async () => {
    render(<SiteAnnouncementNotificationSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    const intervalInput = await screen.findByLabelText(
      "settings:siteAnnouncementNotifications.polling.interval",
    )

    fireEvent.change(intervalInput, { target: { value: "9999" } })
    fireEvent.blur(intervalInput)

    await waitFor(() => {
      expect(updateSiteAnnouncementNotificationsMock).toHaveBeenCalledWith({
        intervalMinutes: 1440,
      })
    })

    expect(intervalInput).toHaveValue(1440)
  })

  it("resets the polling interval input when the update fails", async () => {
    updateSiteAnnouncementNotificationsMock.mockResolvedValue({
      success: false,
    })

    render(<SiteAnnouncementNotificationSettings />, {
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

    render(<SiteAnnouncementNotificationSettings />, {
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
})
