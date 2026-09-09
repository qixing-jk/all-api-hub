import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getNewAccountAutomaticExecutionDefault,
  resolveNewAccountAutomaticExecutionEnabled,
} from "~/services/checkin/autoCheckin/compatibilityConfig"

describe("new-account check-in defaults", () => {
  it("derives automatic intent from candidate method metadata", () => {
    expect(getNewAccountAutomaticExecutionDefault(SITE_TYPES.ANYROUTER)).toBe(
      true,
    )
    expect(getNewAccountAutomaticExecutionDefault(SITE_TYPES.SUB2API)).toBe(
      true,
    )
  })

  it("preserves an explicit disabled preference only for site types with candidates", () => {
    expect(
      resolveNewAccountAutomaticExecutionEnabled({
        siteType: SITE_TYPES.NEW_API,
        currentAutomaticExecutionEnabled: false,
        userPreferenceChanged: true,
      }),
    ).toBe(false)
    expect(
      resolveNewAccountAutomaticExecutionEnabled({
        siteType: SITE_TYPES.SUB2API,
        currentAutomaticExecutionEnabled: false,
        userPreferenceChanged: true,
      }),
    ).toBe(false)
  })

  it("uses the site-type default before the user changes the preference", () => {
    expect(
      resolveNewAccountAutomaticExecutionEnabled({
        siteType: SITE_TYPES.NEW_API,
        currentAutomaticExecutionEnabled: false,
        userPreferenceChanged: false,
      }),
    ).toBe(true)
  })
})
