import { describe, expect, it } from "vitest"

import { accountManagementSearchControls } from "~/features/BasicSettings/components/tabs/AccountManagement/AccountManagement.search"
import { getSortingCriteriaTargetId } from "~/features/BasicSettings/components/tabs/AccountManagement/SortingPrioritySettings/search"
import { SortingCriteriaType } from "~/types/sorting"

describe("account management settings search definitions", () => {
  it("registers individual sorting priority rules as searchable controls", () => {
    expect(
      accountManagementSearchControls
        .filter((control) => control.id.startsWith("control:sorting-"))
        .map((control) => [control.id, control.targetId]),
    ).toContainEqual([
      "control:sorting-pinned",
      getSortingCriteriaTargetId(SortingCriteriaType.PINNED),
    ])
  })
})
