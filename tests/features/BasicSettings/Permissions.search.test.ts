import { describe, expect, it } from "vitest"

import {
  permissionsSearchControls,
  permissionsSearchSections,
} from "~/features/BasicSettings/components/tabs/Permissions/Permissions.search"

describe("permissions settings search definitions", () => {
  it("registers optional permission controls with their rendered target ids", () => {
    expect(permissionsSearchSections).toHaveLength(1)
    expect(
      permissionsSearchControls.map((control) => [
        control.id,
        control.targetId,
      ]),
    ).toContainEqual(["control:permissions-clipboard-read", "clipboardRead"])
  })
})
