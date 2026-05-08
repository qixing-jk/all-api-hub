import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import SiteAnnouncementNotificationSettings from "~/features/BasicSettings/components/tabs/General/SiteAnnouncementNotificationSettings"
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
    updateSiteAnnouncementNotificationsMock.mockResolvedValue(true)
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
      true,
      "settings:siteAnnouncementNotifications.polling.enable",
    )
  })

  it("shows failure feedback when the polling preference update fails", async () => {
    updateSiteAnnouncementNotificationsMock.mockResolvedValue(false)

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
      false,
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
})
