import { describe, expect, it } from "vitest"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { accountManagementSearchControls } from "~/features/BasicSettings/components/tabs/AccountManagement/AccountManagement.search"
import { getSortingCriteriaTargetId } from "~/features/BasicSettings/components/tabs/AccountManagement/SortingPrioritySettings/search"
import { SortingCriteriaType } from "~/types/sorting"

describe("account management settings search definitions", () => {
  it("links the all-groups creation setting to its account-management control", () => {
    const control = accountManagementSearchControls.find(
      (item) => item.id === "control:auto-provision-key-mode",
    )

    expect(control).toMatchObject({
      targetId: SETTINGS_ANCHORS.AUTO_PROVISION_KEY_MODE,
      titleKey: "settings:autoProvisionKeyOnAccountAdd.modeLabel",
    })
    expect(
      BASIC_SETTINGS_ANCHOR_TO_TAB[SETTINGS_ANCHORS.AUTO_PROVISION_KEY_MODE],
    ).toBe("accountManagement")
  })
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
