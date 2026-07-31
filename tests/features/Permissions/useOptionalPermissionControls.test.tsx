import { describe, expect, it, vi } from "vitest"

import { useOptionalPermissionControls } from "~/features/Permissions/hooks/useOptionalPermissionControls"
import {
  OPTIONAL_PERMISSION_IDS,
  type ManifestOptionalPermissions,
} from "~/services/permissions/permissionManager"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const { hasPermissionMock, onOptionalPermissionsChangedMock } = vi.hoisted(
  () => ({
    hasPermissionMock: vi.fn(),
    onOptionalPermissionsChangedMock: vi.fn(() => vi.fn()),
  }),
)

vi.mock("~/services/permissions/permissionManager", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/permissions/permissionManager")
    >()

  return {
    ...actual,
    hasPermission: hasPermissionMock,
    onOptionalPermissionsChanged: onOptionalPermissionsChangedMock,
  }
})

const permissionIds: ManifestOptionalPermissions[] = [
  OPTIONAL_PERMISSION_IDS.Cookies,
  OPTIONAL_PERMISSION_IDS.Notifications,
]

describe("useOptionalPermissionControls", () => {
  it("keeps the latest permission status when an older refresh resolves last", async () => {
    const olderCheck = createDeferred<boolean>()
    const latestCheck = createDeferred<boolean>()
    const singlePermissionIds: ManifestOptionalPermissions[] = [
      OPTIONAL_PERMISSION_IDS.Cookies,
    ]
    let notifyPermissionsChanged: (() => void) | undefined

    hasPermissionMock
      .mockReturnValueOnce(olderCheck.promise)
      .mockReturnValueOnce(latestCheck.promise)
    onOptionalPermissionsChangedMock.mockImplementation(
      (listener?: () => void) => {
        notifyPermissionsChanged = listener
        return vi.fn()
      },
    )

    const { result } = renderHook(
      () =>
        useOptionalPermissionControls({
          loggerName: "OptionalPermissionControlsTest",
          permissionIds: singlePermissionIds,
        }),
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await waitFor(() => expect(hasPermissionMock).toHaveBeenCalledTimes(1))

    act(() => notifyPermissionsChanged?.())
    await waitFor(() => expect(hasPermissionMock).toHaveBeenCalledTimes(2))

    await act(async () => {
      latestCheck.resolve(true)
      await latestCheck.promise
    })
    await waitFor(() => {
      expect(result.current.statuses[OPTIONAL_PERMISSION_IDS.Cookies]).toBe(
        true,
      )
      expect(result.current.isRefreshing).toBe(false)
    })

    await act(async () => {
      olderCheck.resolve(false)
      await olderCheck.promise
    })

    expect(result.current.statuses[OPTIONAL_PERMISSION_IDS.Cookies]).toBe(true)
    expect(result.current.isRefreshing).toBe(false)
  })

  it("ignores a failed permission check from an older refresh", async () => {
    const olderCheck = createDeferred<boolean>()
    const latestCheck = createDeferred<boolean>()
    const singlePermissionIds: ManifestOptionalPermissions[] = [
      OPTIONAL_PERMISSION_IDS.Cookies,
    ]
    let notifyPermissionsChanged: (() => void) | undefined

    hasPermissionMock
      .mockReturnValueOnce(olderCheck.promise)
      .mockReturnValueOnce(latestCheck.promise)
    onOptionalPermissionsChangedMock.mockImplementation(
      (listener?: () => void) => {
        notifyPermissionsChanged = listener
        return vi.fn()
      },
    )

    const { result } = renderHook(
      () =>
        useOptionalPermissionControls({
          loggerName: "OptionalPermissionControlsTest",
          permissionIds: singlePermissionIds,
        }),
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await waitFor(() => expect(hasPermissionMock).toHaveBeenCalledTimes(1))
    act(() => notifyPermissionsChanged?.())
    await waitFor(() => expect(hasPermissionMock).toHaveBeenCalledTimes(2))

    await act(async () => {
      latestCheck.resolve(false)
      await latestCheck.promise
    })
    await waitFor(() => {
      expect(result.current.statuses[OPTIONAL_PERMISSION_IDS.Cookies]).toBe(
        false,
      )
      expect(result.current.isRefreshing).toBe(false)
    })

    await act(async () => {
      olderCheck.reject(new Error("stale permissions API failure"))
      await expect(olderCheck.promise).rejects.toThrow(
        "stale permissions API failure",
      )
    })

    expect(result.current.statuses[OPTIONAL_PERMISSION_IDS.Cookies]).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
  })

  it("ignores a pending status load after the permission ids change", async () => {
    const cookiesCheck = createDeferred<boolean>()
    const notificationsCheck = createDeferred<boolean>()
    const cookiesPermissionIds: ManifestOptionalPermissions[] = [
      OPTIONAL_PERMISSION_IDS.Cookies,
    ]
    const notificationsPermissionIds: ManifestOptionalPermissions[] = [
      OPTIONAL_PERMISSION_IDS.Notifications,
    ]

    hasPermissionMock
      .mockReturnValueOnce(cookiesCheck.promise)
      .mockReturnValueOnce(notificationsCheck.promise)

    const { result, rerender } = renderHook(
      ({ ids }: { ids: ManifestOptionalPermissions[] }) =>
        useOptionalPermissionControls({
          loggerName: "OptionalPermissionControlsTest",
          permissionIds: ids,
        }),
      {
        initialProps: { ids: cookiesPermissionIds },
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await waitFor(() => expect(hasPermissionMock).toHaveBeenCalledTimes(1))
    rerender({ ids: notificationsPermissionIds })
    await waitFor(() => expect(hasPermissionMock).toHaveBeenCalledTimes(2))

    await act(async () => {
      notificationsCheck.resolve(true)
      await notificationsCheck.promise
    })
    await waitFor(() => {
      expect(
        result.current.statuses[OPTIONAL_PERMISSION_IDS.Notifications],
      ).toBe(true)
      expect(result.current.isRefreshing).toBe(false)
    })

    await act(async () => {
      cookiesCheck.resolve(false)
      await cookiesCheck.promise
    })

    expect(result.current.statuses[OPTIONAL_PERMISSION_IDS.Notifications]).toBe(
      true,
    )
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
  })

  it("keeps failed permission checks unknown instead of reporting them as denied", async () => {
    hasPermissionMock.mockImplementation(
      async (permissionId: ManifestOptionalPermissions) => {
        if (permissionId === OPTIONAL_PERMISSION_IDS.Cookies) return false
        throw new Error("permissions API unavailable")
      },
    )

    const { result } = renderHook(
      () =>
        useOptionalPermissionControls({
          loggerName: "OptionalPermissionControlsTest",
          permissionIds,
        }),
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false)
      expect(hasPermissionMock).toHaveBeenCalledTimes(2)
    })

    expect(result.current.statuses).toMatchObject({
      [OPTIONAL_PERMISSION_IDS.Cookies]: false,
      [OPTIONAL_PERMISSION_IDS.Notifications]: null,
    })
    expect(result.current.isLoading).toBe(false)
  })
})
