import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  COOKIE_INTERCEPTOR_PERMISSIONS,
  ensurePermissions,
  hasCookieInterceptorPermissions,
  hasPermission,
  hasPermissions,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_IDS,
  OPTIONAL_PERMISSIONS,
  removePermission,
  requestPermission,
} from "~/services/permissions/permissionManager"

const {
  containsPermissionsMock,
  requestPermissionsMock,
  removePermissionsMock,
  permissionsAddedCallbacks,
  permissionsRemovedCallbacks,
  unsubscribeAddedMock,
  unsubscribeRemovedMock,
} = vi.hoisted(() => ({
  containsPermissionsMock: vi.fn(),
  requestPermissionsMock: vi.fn(),
  removePermissionsMock: vi.fn(),
  permissionsAddedCallbacks: [] as Array<(permissions: any) => void>,
  permissionsRemovedCallbacks: [] as Array<(permissions: any) => void>,
  unsubscribeAddedMock: vi.fn(),
  unsubscribeRemovedMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  containsPermissions: containsPermissionsMock,
  getManifest: vi.fn(() => ({
    optional_permissions: [
      "cookies",
      "webRequest",
      "clipboardRead",
      "notifications",
    ],
  })),
  onPermissionsAdded: vi.fn((callback: (permissions: any) => void) => {
    permissionsAddedCallbacks.push(callback)
    return unsubscribeAddedMock
  }),
  onPermissionsRemoved: vi.fn((callback: (permissions: any) => void) => {
    permissionsRemovedCallbacks.push(callback)
    return unsubscribeRemovedMock
  }),
  removePermissions: removePermissionsMock,
  requestPermissions: requestPermissionsMock,
}))

describe("permissionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionsAddedCallbacks.length = 0
    permissionsRemovedCallbacks.length = 0
  })

  it("reads optional permissions from the manifest and builds cookie interceptor defaults", () => {
    expect(OPTIONAL_PERMISSIONS).toEqual([
      "cookies",
      "webRequest",
      "clipboardRead",
      "notifications",
    ])
    expect(COOKIE_INTERCEPTOR_PERMISSIONS).toEqual([
      OPTIONAL_PERMISSION_IDS.Cookies,
      OPTIONAL_PERMISSION_IDS.WebRequest,
      OPTIONAL_PERMISSION_IDS.WebRequestBlocking,
    ])
  })

  it("wraps single-permission checks, requests, and removals", async () => {
    containsPermissionsMock.mockResolvedValueOnce(true)
    requestPermissionsMock.mockResolvedValueOnce(true)
    removePermissionsMock.mockResolvedValueOnce(true)

    await expect(hasPermission("cookies")).resolves.toBe(true)
    await expect(requestPermission("clipboardRead")).resolves.toBe(true)
    await expect(removePermission("webRequest")).resolves.toBe(true)

    expect(containsPermissionsMock).toHaveBeenCalledWith({
      permissions: ["cookies"],
    })
    expect(requestPermissionsMock).toHaveBeenCalledWith({
      permissions: ["clipboardRead"],
    })
    expect(removePermissionsMock).toHaveBeenCalledWith({
      permissions: ["webRequest"],
    })
  })

  it("short-circuits empty permission arrays and reuses the cookie-interceptor helper", async () => {
    containsPermissionsMock.mockResolvedValueOnce(true)

    await expect(hasPermissions([])).resolves.toBe(true)
    await expect(hasCookieInterceptorPermissions()).resolves.toBe(true)

    expect(containsPermissionsMock).toHaveBeenCalledTimes(1)
    expect(containsPermissionsMock).toHaveBeenCalledWith({
      permissions: COOKIE_INTERCEPTOR_PERMISSIONS,
    })
  })

  it("requests only missing permissions during ensurePermissions", async () => {
    containsPermissionsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
    requestPermissionsMock.mockResolvedValueOnce(true)

    await expect(
      ensurePermissions(["cookies", "webRequest", "clipboardRead"]),
    ).resolves.toBe(true)

    expect(requestPermissionsMock).toHaveBeenCalledWith({
      permissions: ["webRequest", "clipboardRead"],
    })
  })

  it("returns true from ensurePermissions when nothing is missing", async () => {
    containsPermissionsMock.mockResolvedValue(true)

    await expect(
      ensurePermissions(["cookies", "webRequest", "clipboardRead"]),
    ).resolves.toBe(true)

    expect(requestPermissionsMock).not.toHaveBeenCalled()
  })

  it("only notifies listeners for declared optional permissions and unsubscribes both handlers", () => {
    const callback = vi.fn()

    const unsubscribe = onOptionalPermissionsChanged(callback)

    expect(permissionsAddedCallbacks).toHaveLength(1)
    expect(permissionsRemovedCallbacks).toHaveLength(1)

    permissionsAddedCallbacks[0]({ permissions: ["tabs"] })
    permissionsRemovedCallbacks[0]({ permissions: [] })
    expect(callback).not.toHaveBeenCalled()

    permissionsAddedCallbacks[0]({ permissions: ["clipboardRead"] })
    permissionsRemovedCallbacks[0]({ permissions: ["cookies"] })
    expect(callback).toHaveBeenCalledTimes(2)

    unsubscribe()
    expect(unsubscribeAddedMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeRemovedMock).toHaveBeenCalledTimes(1)
  })
})
