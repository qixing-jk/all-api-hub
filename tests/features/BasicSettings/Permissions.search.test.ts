import { describe, expect, it } from "vitest"

import {
  permissionsSearchControls,
  permissionsSearchSections,
} from "~/features/BasicSettings/components/tabs/Permissions/Permissions.search"

describe("permissions settings search definitions", () => {
  it("registers every optional permission control with rendered target ids", () => {
    expect(permissionsSearchSections).toHaveLength(1)
    expect(permissionsSearchControls.map((control) => control.id)).toEqual([
      "control:permissions-refresh",
      "control:permissions-cookies",
      "control:permissions-dnr-host-access",
      "control:permissions-webrequest",
      "control:permissions-webrequest-blocking",
      "control:permissions-clipboard-read",
      "control:permissions-notifications",
      "control:permissions-bookmarks",
    ])

    expect(
      permissionsSearchControls.map((control) => [
        control.id,
        control.targetId,
      ]),
    ).toContainEqual(["control:permissions-clipboard-read", "clipboardRead"])

    expect(
      permissionsSearchControls.find(
        (control) => control.id === "control:permissions-bookmarks",
      ),
    ).toMatchObject({
      pageId: "basic",
      tabId: "permissions",
      targetId: "bookmarks",
      titleKey: "settings:permissions.items.bookmarks.title",
      descriptionKey: "settings:permissions.items.bookmarks.description",
      keywords: ["permission", "bookmark", "bookmarks", "browser bookmarks"],
    })
  })
})
