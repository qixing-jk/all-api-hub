import { describe, expect, it } from "vitest"

import {
  checkinRedeemSearchControls,
  checkinRedeemSearchSections,
} from "~/features/BasicSettings/components/tabs/CheckinRedeem/CheckinRedeem.search"
import { AUTO_CHECKIN_TARGET_IDS } from "~/features/BasicSettings/components/tabs/CheckinRedeem/searchTargets"

describe("auto check-in settings search targets", () => {
  it("uses the same stable IDs for rendered controls and search results", () => {
    expect(checkinRedeemSearchSections).toContainEqual(
      expect.objectContaining({ targetId: AUTO_CHECKIN_TARGET_IDS.section }),
    )

    const expectedTargetIds = Object.values(AUTO_CHECKIN_TARGET_IDS).slice(1)
    expect(
      checkinRedeemSearchControls
        .filter((item) => item.id.startsWith("control:auto-checkin-"))
        .map((item) => item.targetId),
    ).toEqual(expect.arrayContaining(expectedTargetIds))
  })
})
