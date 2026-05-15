import { act, cleanup, fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import PermissionSettings from "~/features/BasicSettings/components/tabs/Permissions/PermissionSettings"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_PERMISSION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/events"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const {
  changedListenerRef,
  hasPermissionMock,
  onOptionalPermissionsChangedMock,
  removePermissionMock,
  requestPermissionMock,
  showResultToastMock,
  trackProductAnalyticsEventMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  changedListenerRef: {
    current: null as null | (() => void),
  },
  hasPermissionMock: vi.fn(),
  onOptionalPermissionsChangedMock: vi.fn(),
  removePermissionMock: vi.fn(),
  requestPermissionMock: vi.fn(),
  showResultToastMock: vi.fn(),
  trackProductAnalyticsEventMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}))

vi.mock("~/services/permissions/permissionManager", () => ({
  OPTIONAL_PERMISSION_IDS: {
    Cookies: "cookies",
    declarativeNetRequestWithHostAccess: "declarativeNetRequestWithHostAccess",
    WebRequest: "webRequest",
    WebRequestBlocking: "webRequestBlocking",
    ClipboardRead: "clipboardRead",
    Notifications: "notifications",
  },
  OPTIONAL_PERMISSIONS: ["cookies", "clipboardRead", "notifications"],
  OPTIONAL_PERMISSION_DEFINITIONS: [
    { id: "cookies" },
    { id: "clipboardRead" },
    { id: "notifications" },
  ],
  hasPermission: (id: string) => hasPermissionMock(id),
  onOptionalPermissionsChanged: (listener: () => void) =>
    onOptionalPermissionsChangedMock(listener),
  removePermission: (id: string) => removePermissionMock(id),
  requestPermission: (id: string) => requestPermissionMock(id),
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: (...args: unknown[]) => showResultToastMock(...args),
}))

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()
  return {
    ...actual,
    trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
  }
})

describe("PermissionSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockImplementation(
      async (id: string) => id === "cookies" || id === "notifications",
    )
    requestPermissionMock.mockResolvedValue(true)
    removePermissionMock.mockResolvedValue(false)
    onOptionalPermissionsChangedMock.mockImplementation((listener) => {
      changedListenerRef.current = listener
      return unsubscribeMock
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("loads permission states, refreshes, and toggles grant/remove actions", async () => {
    render(<PermissionSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(
      await screen.findAllByText("settings:permissions.status.granted"),
    ).toHaveLength(2)
    expect(
      screen.getAllByText("settings:permissions.status.denied"),
    ).toHaveLength(1)
    expect(
      screen.getByText("settings:permissions.items.notifications.title"),
    ).toBeInTheDocument()

    const cookiesRow = document.getElementById("cookies")
    const clipboardRow = document.getElementById("clipboardRead")
    const notificationsRow = document.getElementById("notifications")

    if (!cookiesRow || !clipboardRow || !notificationsRow) {
      throw new Error("Expected permission rows to be rendered")
    }

    fireEvent.click(
      within(cookiesRow).getByRole("button", {
        name: "settings:permissions.actions.remove",
      }),
    )
    fireEvent.click(
      within(clipboardRow).getByRole("button", {
        name: "settings:permissions.actions.allow",
      }),
    )
    fireEvent.click(
      within(notificationsRow).getByRole("button", {
        name: "settings:permissions.actions.remove",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:permissions.actions.refresh",
      }),
    )

    await waitFor(() => {
      expect(removePermissionMock).toHaveBeenCalledWith("cookies")
    })
    expect(requestPermissionMock).toHaveBeenCalledWith("clipboardRead")
    expect(removePermissionMock).toHaveBeenCalledWith("notifications")
    expect(showResultToastMock).toHaveBeenCalledWith(
      true,
      "settings:permissions.messages.granted",
      "settings:permissions.messages.grantFailed",
    )
    expect(showResultToastMock).toHaveBeenCalledWith(
      false,
      "settings:permissions.messages.revoked",
      "settings:permissions.messages.revokeFailed",
    )
    expect(hasPermissionMock).toHaveBeenCalledWith("cookies")
    expect(hasPermissionMock).toHaveBeenCalledWith("clipboardRead")
    expect(hasPermissionMock).toHaveBeenCalledWith("notifications")
    expect(hasPermissionMock.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Cookies,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.ClipboardRead,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.Notifications,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
  })

  it("reloads statuses on external permission change and unsubscribes on cleanup", async () => {
    const { unmount } = render(<PermissionSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await screen.findAllByText("settings:permissions.status.granted")

    hasPermissionMock.mockResolvedValue(false)
    const listener = changedListenerRef.current
    if (!listener) {
      throw new Error("Expected optional-permissions change listener")
    }
    await act(async () => {
      await listener()
    })

    await waitFor(() => {
      expect(hasPermissionMock).toHaveBeenCalledWith("cookies")
      expect(hasPermissionMock).toHaveBeenCalledWith("clipboardRead")
      expect(hasPermissionMock).toHaveBeenCalledWith("notifications")
    })

    unmount()
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })

  it("shows an error toast when requesting a permission throws", async () => {
    requestPermissionMock.mockRejectedValueOnce(new Error("request failed"))

    render(<PermissionSettings />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await screen.findByText("settings:permissions.items.clipboardRead.title")
    const clipboardRow = document.getElementById("clipboardRead")
    if (!clipboardRow) {
      throw new Error("Expected clipboard permission row")
    }

    const allowButton = await within(clipboardRow).findByRole("button", {
      name: "settings:permissions.actions.allow",
    })

    await waitFor(() => {
      expect(allowButton).toBeEnabled()
    })

    fireEvent.click(
      within(clipboardRow).getByRole("button", {
        name: "settings:permissions.actions.allow",
      }),
    )

    await waitFor(() => {
      expect(showResultToastMock).toHaveBeenCalledWith(
        false,
        "settings:permissions.messages.granted",
        "settings:permissions.messages.grantFailed",
      )
    })
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: PRODUCT_ANALYTICS_PERMISSION_IDS.ClipboardRead,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
  })
})
