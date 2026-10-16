import { afterEach, describe, expect, it, vi } from "vitest"

import { getBrowserNotificationAvailability } from "~/services/notifications/browserNotificationAvailability"

const { hasPermission, getLevel, hasApi } = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  getLevel: vi.fn(),
  hasApi: vi.fn(),
}))
vi.mock("~/services/permissions/permissionManager", () => ({
  hasPermission,
  OPTIONAL_PERMISSION_IDS: { Notifications: "notifications" },
}))
vi.mock("~/utils/browser/notifications", () => ({
  hasNotificationsAPI: hasApi,
  getNotificationPermissionLevel: getLevel,
}))

afterEach(() => vi.resetAllMocks())
describe("browser notification availability", () => {
  it("distinguishes absent extension permission from a browser-level block", async () => {
    hasPermission.mockResolvedValue(false)
    expect(await getBrowserNotificationAvailability()).toBe(
      "permission_required",
    )
    hasPermission.mockResolvedValue(true)
    hasApi.mockReturnValue(true)
    getLevel.mockResolvedValue("denied")
    expect(await getBrowserNotificationAvailability()).toBe("blocked")
  })
  it("reports only a confirmed grant as available", async () => {
    hasPermission.mockResolvedValue(true)
    hasApi.mockReturnValue(true)
    getLevel.mockResolvedValue("granted")
    expect(await getBrowserNotificationAvailability()).toBe("available")
    getLevel.mockResolvedValue(null)
    expect(await getBrowserNotificationAvailability()).toBe("unknown")
  })
})
