import { describe, expect, it, vi } from "vitest"

import { useOptionalPermissionControls } from "~/features/Permissions/hooks/useOptionalPermissionControls"
import {
  OPTIONAL_PERMISSION_IDS,
  type ManifestOptionalPermissions,
} from "~/services/permissions/permissionManager"
import { renderHook, waitFor } from "~~/tests/test-utils/render"

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
