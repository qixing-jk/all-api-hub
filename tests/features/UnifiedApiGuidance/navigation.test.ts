import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import { buildGuidedAccountKeyImportTarget } from "~/features/UnifiedApiGuidance/navigation"

describe("buildGuidedAccountKeyImportTarget", () => {
  it("omits deep-link params when no importable account can be preselected", () => {
    expect(buildGuidedAccountKeyImportTarget(undefined)).toEqual({
      menuItemId: MENU_ITEM_IDS.KEYS,
      params: undefined,
    })
  })

  it("includes the guided import target for a preselected account", () => {
    expect(buildGuidedAccountKeyImportTarget("account-1")).toEqual({
      menuItemId: MENU_ITEM_IDS.KEYS,
      params: {
        accountId: "account-1",
        [KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]:
          KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
      },
    })
  })
})
