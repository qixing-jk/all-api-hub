import { describe, expect, it, vi } from "vitest"

import { permissionsSearchControls } from "~/features/BasicSettings/components/tabs/Permissions/Permissions.search"
import type { OptionsSearchContext } from "~/features/OptionsSearch/types"

const { optionalPermissions } = vi.hoisted(() => ({
  optionalPermissions: [] as string[],
}))
vi.mock("~/services/permissions/permissionManager", () => ({
  OPTIONAL_PERMISSIONS: optionalPermissions,
}))

const context: OptionsSearchContext = {
  hasOptionalPermissions: true,
  autoCheckinEnabled: false,
  managedSiteType: "new-api",
  modelRedirectEnabled: false,
  sidePanelSupported: true,
  showTodayCashflow: true,
  webdavAutoSyncEnabled: false,
}

describe("optional permission search targets", () => {
  it.each([
    ["Chromium", ["cookies", "clipboardRead", "notifications", "bookmarks"]],
    [
      "Firefox",
      ["cookies", "webRequest", "webRequestBlocking", "notifications"],
    ],
    [
      "deferred Safari manifest",
      ["cookies", "declarativeNetRequestWithHostAccess", "notifications"],
    ],
  ])(
    "only exposes declared optional permission controls for %s",
    (_browser, permissions) => {
      optionalPermissions.splice(0, optionalPermissions.length, ...permissions)
      const targets = permissionsSearchControls
        .filter((item) => item.isVisible?.(context))
        .map((item) => item.targetId)
      expect(targets).toEqual(["permissions-refresh-status", ...permissions])
    },
  )
})
