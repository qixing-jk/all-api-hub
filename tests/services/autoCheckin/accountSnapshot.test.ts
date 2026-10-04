import { describe, expect, it } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { refreshAutoCheckinAccountSnapshots } from "~/services/checkin/autoCheckin/accountSnapshot"
import type { AutoCheckinAccountSnapshot } from "~/types/autoCheckin"
import {
  buildCheckInConfig,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

describe("current check-in readiness", () => {
  const account = buildSiteAccount({
    site_type: SITE_TYPES.NEW_API,
    checkIn: buildCheckInConfig({
      automaticExecutionEnabled: true,
      selection: {
        mode: "manual",
        methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
      },
      methodKnowledge: {
        methods: {
          [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 1 },
            },
          },
        },
      },
    }),
  })
  const old: AutoCheckinAccountSnapshot = {
    accountId: account.id,
    accountName: "Old name",
    siteType: SITE_TYPES.NEW_API,
    detectionEnabled: false,
    autoCheckinEnabled: true,
    providerAvailable: false,
    skipReason: "no_selected_method",
    lastResult: {
      accountId: account.id,
      accountName: "Old name",
      status: "skipped",
      timestamp: 1,
      reasonCode: "no_selected_method",
    },
  }
  it("refreshes readiness after selecting a method without rewriting execution history", () => {
    const [updated] = refreshAutoCheckinAccountSnapshots([old], [account])
    expect(updated?.detectionEnabled).toBe(true)
    expect(updated?.providerAvailable).toBe(true)
    expect(updated?.skipReason).toBeUndefined()
    expect(updated?.lastResult).toEqual(old.lastResult)
    expect(old.detectionEnabled).toBe(false)
  })
  it("shows the latest disabled intent while keeping deleted-account history", () => {
    const [updated] = refreshAutoCheckinAccountSnapshots(
      [old],
      [
        {
          ...account,
          checkIn: { ...account.checkIn, automaticExecutionEnabled: false },
        },
      ],
    )
    expect(updated?.autoCheckinEnabled).toBe(false)
    expect(updated?.skipReason).toBe("auto_checkin_disabled")
    expect(refreshAutoCheckinAccountSnapshots([old], [])).toEqual([old])
  })
  it("keeps readiness blocked when global automatic execution is disabled", () => {
    const [updated] = refreshAutoCheckinAccountSnapshots(
      [old],
      [account],
      {},
      false,
    )
    expect(updated?.detectionEnabled).toBe(true)
    expect(updated?.skipReason).toBe("auto_checkin_disabled")
  })
})
