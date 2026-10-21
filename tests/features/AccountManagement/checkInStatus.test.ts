import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_CHECK_IN_AUTOMATION_KINDS,
  CHECK_IN_CONFIGURATION_ACTIONS,
  getAccountCheckInAutomationState,
  getSiteCheckInDisplayState,
  SITE_CHECK_IN_DISPLAY_KINDS,
} from "~/features/AccountManagement/checkInStatus"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
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
