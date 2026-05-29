import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  COOKIE_INTERCEPTOR_PERMISSIONS,
  ensurePermissions,
  ensurePermissionsDetailed,
  hasCookieInterceptorPermissions,
  hasPermission,
  hasPermissions,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_IDS,
  OPTIONAL_PERMISSIONS,
  removePermission,
  removePermissionDetailed,
  requestPermission,
  requestPermissionDetailed,
} from "~/services/permissions/permissionManager"

const {
  containsPermissionsMock,
  requestPermissionsDetailedMock,
  requestPermissionsMock,
  removePermissionsDetailedMock,
  removePermissionsMock,
  permissionsAddedCallbacks,
  permissionsRemovedCallbacks,
  unsubscribeAddedMock,
  unsubscribeRemovedMock,
} = vi.hoisted(() => ({
  containsPermissionsMock: vi.fn(),
  requestPermissionsDetailedMock: vi.fn(),
  requestPermissionsMock: vi.fn(),
  removePermissionsDetailedMock: vi.fn(),
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
  removePermissionsDetailed: removePermissionsDetailedMock,
  requestPermissions: requestPermissionsMock,
  requestPermissionsDetailed: requestPermissionsDetailedMock,
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
    requestPermissionsDetailedMock.mockResolvedValueOnce({
      success: true,
    })
    removePermissionsMock.mockResolvedValueOnce(true)
    removePermissionsDetailedMock.mockResolvedValueOnce({
      success: false,
      failureReason: "api_exception",
    })

    await expect(hasPermission("cookies")).resolves.toBe(true)
    await expect(requestPermission("clipboardRead")).resolves.toBe(true)
    await expect(requestPermissionDetailed("clipboardRead")).resolves.toEqual({
      success: true,
    })
    await expect(removePermission("webRequest")).resolves.toBe(true)
    await expect(removePermissionDetailed("webRequest")).resolves.toEqual({
      success: false,
      failureReason: "api_exception",
    })

    expect(containsPermissionsMock).toHaveBeenCalledWith({
      permissions: ["cookies"],
    })
    expect(requestPermissionsMock).toHaveBeenCalledWith({
      permissions: ["clipboardRead"],
    })
    expect(requestPermissionsDetailedMock).toHaveBeenCalledWith({
      permissions: ["clipboardRead"],
    })
    expect(removePermissionsMock).toHaveBeenCalledWith({
      permissions: ["webRequest"],
    })
    expect(removePermissionsDetailedMock).toHaveBeenCalledWith({
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
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    requestPermissionsDetailedMock.mockResolvedValueOnce({ success: true })

    await expect(
      ensurePermissions(["cookies", "webRequest", "clipboardRead"]),
    ).resolves.toBe(true)

    expect(requestPermissionsDetailedMock).toHaveBeenCalledWith({
      permissions: ["webRequest", "clipboardRead"],
    })
  })

  it("returns per-permission details for only the missing permissions request", async () => {
    containsPermissionsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
    requestPermissionsDetailedMock.mockResolvedValueOnce({ success: true })

    await expect(
      ensurePermissionsDetailed(["cookies", "webRequest", "clipboardRead"]),
    ).resolves.toEqual({
      success: true,
      results: [
        {
          id: "cookies",
          requested: false,
          success: true,
          wasGrantedBefore: true,
          wasGrantedAfter: true,
        },
        {
          id: "webRequest",
          requested: true,
          success: true,
          wasGrantedBefore: false,
          wasGrantedAfter: true,
        },
        {
          id: "clipboardRead",
          requested: true,
          success: true,
          wasGrantedBefore: false,
          wasGrantedAfter: true,
        },
      ],
      requestedResults: [
        {
          id: "webRequest",
          requested: true,
          success: true,
          wasGrantedBefore: false,
          wasGrantedAfter: true,
        },
        {
          id: "clipboardRead",
          requested: true,
          success: true,
          wasGrantedBefore: false,
          wasGrantedAfter: true,
        },
      ],
    })

    expect(requestPermissionsDetailedMock).toHaveBeenCalledWith({
      permissions: ["webRequest", "clipboardRead"],
    })
  })

  it("preserves API exception details for each requested permission", async () => {
    containsPermissionsMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
    requestPermissionsDetailedMock.mockResolvedValueOnce({
      success: false,
      failureReason: "api_exception",
    })

    await expect(
      ensurePermissionsDetailed(["webRequest", "clipboardRead"]),
    ).resolves.toEqual({
      success: false,
      results: [
        {
          id: "webRequest",
          requested: true,
          success: false,
          failureReason: "api_exception",
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
        {
          id: "clipboardRead",
          requested: true,
          success: false,
          failureReason: "api_exception",
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
      ],
      requestedResults: [
        {
          id: "webRequest",
          requested: true,
          success: false,
          failureReason: "api_exception",
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
        {
          id: "clipboardRead",
          requested: true,
          success: false,
          failureReason: "api_exception",
          wasGrantedBefore: false,
          wasGrantedAfter: false,
        },
      ],
    })
  })

  it("fails the ensure result when a successful request is not granted after recheck", async () => {
    containsPermissionsMock
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("post-probe failed"))
    requestPermissionsDetailedMock.mockResolvedValueOnce({ success: true })

    await expect(ensurePermissions(["clipboardRead"])).resolves.toBe(false)

    vi.clearAllMocks()

    containsPermissionsMock
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("post-probe failed"))
    requestPermissionsDetailedMock.mockResolvedValueOnce({ success: true })

    await expect(ensurePermissionsDetailed(["clipboardRead"])).resolves.toEqual(
      {
        success: false,
        results: [
          {
            id: "clipboardRead",
            requested: true,
            success: false,
            wasGrantedBefore: false,
            wasGrantedAfter: false,
          },
        ],
        requestedResults: [
          {
            id: "clipboardRead",
            requested: true,
            success: false,
            wasGrantedBefore: false,
            wasGrantedAfter: false,
          },
        ],
      },
    )
  })

  it("uses the post-request grant state when the request API reports denial", async () => {
    containsPermissionsMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    requestPermissionsDetailedMock.mockResolvedValueOnce({ success: false })

    await expect(ensurePermissionsDetailed(["clipboardRead"])).resolves.toEqual(
      {
        success: true,
        results: [
          {
            id: "clipboardRead",
            requested: true,
            success: true,
            wasGrantedBefore: false,
            wasGrantedAfter: true,
          },
        ],
        requestedResults: [
          {
            id: "clipboardRead",
            requested: true,
            success: true,
            wasGrantedBefore: false,
            wasGrantedAfter: true,
          },
        ],
      },
    )
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
