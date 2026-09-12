import { describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import {
  buildGuidedAccountKeyImportTarget,
  openGatewayGuidanceOverview,
} from "~/features/UnifiedApiGuidance/navigation"
import { pushWithinOptionsPage } from "~/utils/navigation"

vi.mock("~/utils/navigation", () => ({ pushWithinOptionsPage: vi.fn() }))

it("opens the whole overview guide as a preview", () => {
  openGatewayGuidanceOverview()
  expect(pushWithinOptionsPage).toHaveBeenCalledWith("#overview", {
    gatewayGuide: "1",
  })
})

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
