import { describe, expect, it } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_CHECK_IN_AUTOMATION_KINDS,
  CHECK_IN_CONFIGURATION_ACTIONS,
  getAccountCheckInAutomationState,
  getSiteCheckInDisplayState,
  SITE_CHECK_IN_DISPLAY_KINDS,
} from "~/features/AccountManagement/checkInStatus"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const account = () =>
  buildDisplaySiteData({
    siteType: SITE_TYPES.NEW_API,
    checkIn: createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: false,
      automaticExecutionEnabled: true,
    }),
  })
describe("unified check-in presentation", () => {
  it("exposes missing configuration when automation was requested without a usable method", () => {
    expect(getSiteCheckInDisplayState(account())).toMatchObject({
      kind: SITE_CHECK_IN_DISPLAY_KINDS.Configuration,
      action: CHECK_IN_CONFIGURATION_ACTIONS.Configure,
    })
    const disabled = account()
    disabled.checkIn.automaticExecutionEnabled = false
    expect(getSiteCheckInDisplayState(disabled)).toBeNull()
  })
  it("uses a migrated day key when no observation timestamp was preserved", () => {
    const current = account()
    current.checkIn = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.NEW_API,
      supported: true,
      automaticExecutionEnabled: false,
    })
    current.checkIn.methodKnowledge.methods[
      AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
    ]!.status = {
      outcome: "known",
      today: "checked",
      evidence: {
        source: "legacy_migration",
        legacyDayKey: getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000)),
      },
    }
    expect(getSiteCheckInDisplayState(current)).toMatchObject({
      kind: "current",
      checkedIn: true,
    })
    current.checkIn.methodKnowledge.methods[
      AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
    ]!.status = {
      outcome: "known",
      today: "checked",
      evidence: { source: "probe", observedAt: NaN },
    }
    expect(getSiteCheckInDisplayState(current)).toMatchObject({
      kind: "outdated",
    })
  })
  it("offers manual action after an unreadable method query fails", () => {
    const current = account()
    current.siteType = SITE_TYPES.ANYROUTER
    current.checkIn = createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.ANYROUTER,
      supported: true,
      automaticExecutionEnabled: false,
    })
    current.checkIn.methodKnowledge.methods[
      AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn
    ]!.status = { outcome: "unknown", reason: "network", attemptedAt: 1 }
    expect(getSiteCheckInDisplayState(current)).toEqual({ kind: "manual" })
  })
  it("reports effective automation state without treating a saved switch as active", () => {
    expect(getAccountCheckInAutomationState(account(), false)).toEqual({
      kind: ACCOUNT_CHECK_IN_AUTOMATION_KINDS.GloballyDisabled,
    })
    expect(
      getAccountCheckInAutomationState({ ...account(), disabled: true }, true),
    ).toEqual({ kind: ACCOUNT_CHECK_IN_AUTOMATION_KINDS.AccountDisabled })
    expect(getAccountCheckInAutomationState(account(), true)).toMatchObject({
      kind: ACCOUNT_CHECK_IN_AUTOMATION_KINDS.Blocked,
    })
  })
})
