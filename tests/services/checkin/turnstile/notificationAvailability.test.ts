import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getBrowserNotificationAvailability } from "~/services/notifications/browserNotificationAvailability"
import { NOTIFICATION_PERMISSION_LEVELS } from "~/utils/browser/notifications"

const { hasPermission, isDeclared } = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  isDeclared: vi.fn(),
}))
vi.mock("~/services/permissions/permissionManager", () => ({
  hasPermission,
  isPermissionDeclared: isDeclared,
  OPTIONAL_PERMISSION_IDS: { Notifications: "notifications" },
}))
const getLevel = vi.fn()

const stubPermissionLevelApi = () => {
  vi.stubGlobal("browser", { notifications: { getPermissionLevel: getLevel } })
}

beforeEach(() => {
  isDeclared.mockReturnValue(true)
  stubPermissionLevelApi()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})
describe("browser notification availability", () => {
  it("distinguishes an ungranted hidden API from a browser-level block", async () => {
    vi.stubGlobal("browser", {})
    hasPermission.mockResolvedValue(false)
    expect(await getBrowserNotificationAvailability()).toBe(
      "permission_required",
    )
    hasPermission.mockResolvedValue(true)
    stubPermissionLevelApi()
    getLevel.mockResolvedValue(NOTIFICATION_PERMISSION_LEVELS.Denied)
    expect(await getBrowserNotificationAvailability()).toBe("blocked")
  })
  it("reports an explicit browser-level grant as available", async () => {
    hasPermission.mockResolvedValue(true)
    getLevel.mockResolvedValue(NOTIFICATION_PERMISSION_LEVELS.Granted)
    expect(await getBrowserNotificationAvailability()).toBe("available")
  })
  it("reports an inconclusive level as unknown", async () => {
    hasPermission.mockResolvedValue(true)
    getLevel.mockResolvedValue(null)
    expect(await getBrowserNotificationAvailability()).toBe("unknown")
  })
  it("allows Firefox notifications after grant without a permission-level API", async () => {
    vi.stubGlobal("browser", { notifications: { create: vi.fn() } })
    hasPermission.mockResolvedValue(true)
    expect(await getBrowserNotificationAvailability()).toBe("available")
  })
  it("reports a missing notifications namespace as unavailable after grant", async () => {
    vi.stubGlobal("browser", {})
    hasPermission.mockResolvedValue(true)
    expect(await getBrowserNotificationAvailability()).toBe("unavailable")
  })
  it("reports an exposed namespace without a level query or create method as unknown", async () => {
    vi.stubGlobal("browser", { notifications: {} })
    hasPermission.mockResolvedValue(true)
    expect(await getBrowserNotificationAvailability()).toBe("unknown")
  })
  it("returns unknown when a supported notification level lookup fails", async () => {
    hasPermission.mockResolvedValue(true)
    getLevel.mockRejectedValue(new Error("Notification level unavailable"))
    expect(await getBrowserNotificationAvailability()).toBe("unknown")
  })
  it("returns unknown when permission lookup throws", async () => {
    hasPermission.mockRejectedValue(new Error("Storage unavailable"))
    expect(await getBrowserNotificationAvailability()).toBe("unknown")
  })
  it("reports unsupported browsers without asking for an impossible permission", async () => {
    isDeclared.mockReturnValue(false)
    vi.stubGlobal("browser", {})
    expect(await getBrowserNotificationAvailability()).toBe("unavailable")
    expect(hasPermission).not.toHaveBeenCalled()
    expect(getLevel).not.toHaveBeenCalled()
  })
})
