import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getBrowserNotificationAvailability } from "~/services/notifications/browserNotificationAvailability"

const { hasPermission, getLevel, hasApi, isDeclared } = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  isDeclared: vi.fn(),
  getLevel: vi.fn(),
  hasApi: vi.fn(),
}))
vi.mock("~/services/permissions/permissionManager", () => ({
  hasPermission,
  isPermissionDeclared: isDeclared,
  OPTIONAL_PERMISSION_IDS: { Notifications: "notifications" },
}))
vi.mock("~/utils/browser/notifications", () => ({
  hasNotificationsAPI: hasApi,
  getNotificationPermissionLevel: getLevel,
}))

beforeEach(() => isDeclared.mockReturnValue(true))
afterEach(() => vi.resetAllMocks())
describe("browser notification availability", () => {
  it("distinguishes an ungranted hidden API from a browser-level block", async () => {
    hasApi.mockReturnValue(false)
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
  it("returns unknown when permission lookup throws", async () => {
    hasApi.mockReturnValue(true)
    hasPermission.mockRejectedValue(new Error("Storage unavailable"))
    expect(await getBrowserNotificationAvailability()).toBe("unknown")
  })
  it("reports unsupported browsers without asking for an impossible permission", async () => {
    isDeclared.mockReturnValue(false)
    hasApi.mockReturnValue(false)
    expect(await getBrowserNotificationAvailability()).toBe("unavailable")
    expect(hasPermission).not.toHaveBeenCalled()
    expect(getLevel).not.toHaveBeenCalled()
  })
})
