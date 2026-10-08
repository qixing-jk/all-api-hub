import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getNewAccountAutomaticExecutionDefault,
  resolveNewAccountAutomaticExecutionEnabled,
} from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"

describe("new-account check-in defaults", () => {
  it("enables the canonical login-check-in candidate without changing other unknown sites", () => {
    expect(
      getNewAccountAutomaticExecutionDefault(
        SITE_TYPES.UNKNOWN,
        "https://agentrouter.org",
      ),
    ).toBe(true)
    expect(
      getNewAccountAutomaticExecutionDefault(
        SITE_TYPES.UNKNOWN,
        "https://ps.air-outer.com",
      ),
    ).toBe(true)
    expect(
      getNewAccountAutomaticExecutionDefault(
        SITE_TYPES.UNKNOWN,
        "https://other.example",
      ),
    ).toBe(false)
    expect(
      resolveNewAccountAutomaticExecutionEnabled({
        siteType: SITE_TYPES.UNKNOWN,
        siteUrl: "https://agentrouter.org",
        currentAutomaticExecutionEnabled: false,
        userPreferenceChanged: true,
      }),
    ).toBe(false)
  })
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

  it("defaults automatic execution to false when discovery outcome is unsupported", () => {
    expect(
      resolveNewAccountAutomaticExecutionEnabled({
        siteType: SITE_TYPES.SUB2API,
        currentAutomaticExecutionEnabled: true,
        userPreferenceChanged: false,
        decisionOutcome: "unsupported",
      }),
    ).toBe(false)

    expect(
      resolveNewAccountAutomaticExecutionEnabled({
        siteType: SITE_TYPES.SUB2API,
        currentAutomaticExecutionEnabled: true,
        userPreferenceChanged: true,
        decisionOutcome: "unsupported",
      }),
    ).toBe(true)
  })

  it("derives unsupported outcome from checkIn inspection if provided", () => {
    expect(
      resolveNewAccountAutomaticExecutionEnabled({
        siteType: SITE_TYPES.NEW_API,
        currentAutomaticExecutionEnabled: true,
        userPreferenceChanged: false,
        checkIn: {
          automaticExecutionEnabled: true,
          selection: { mode: "automatic" },
          methodKnowledge: {
            methods: {
              "new-api:daily-checkin": {
                detection: {
                  outcome: "unsupported",
                  evidence: { source: "probe", observedAt: 1 },
                },
              },
            },
          },
        },
      }),
    ).toBe(false)
  })
})
