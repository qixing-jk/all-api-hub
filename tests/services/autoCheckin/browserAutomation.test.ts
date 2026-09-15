import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import {
  DEFAULT_BROWSER_CHECK_IN_CONFIG,
  ensureBrowserAutomationMethodState,
  isBrowserAutomationCheckInConfigured,
  isValidBrowserCheckInTaskContract,
  normalizeBrowserCheckInConfig,
  syncBrowserAutomationMethodState,
} from "~/services/checkin/autoCheckin/browserAutomation"
import type { CheckInConfig } from "~/types/checkIn"
import {
  isBrowserCheckInConfig,
  isSafeBrowserCheckInPattern,
} from "~/types/checkinAutomation"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const VALID_BROWSER_CONFIG = {
  enabled: true,
  action: { kind: "click_selector" as const, selector: "button.check-in" },
  success: { textPattern: "checked|success" },
  identity: { selector: ".account-name", textPattern: "user@example.com" },
  timeoutMs: 15_000,
}

const createConfiguredCheckIn = (
  browserAutomation = VALID_BROWSER_CONFIG,
): CheckInConfig =>
  buildCheckInConfig({
    customCheckIn: {
      url: "https://checkin.example.invalid/console",
      browserAutomation,
    },
  })

describe("browser check-in configuration", () => {
  it("accepts bounded actions, success conditions, identities, and timeouts", () => {
    expect(isBrowserCheckInConfig(VALID_BROWSER_CONFIG)).toBe(true)
    expect(
      isBrowserAutomationCheckInConfigured(
        createConfiguredCheckIn().customCheckIn,
      ),
    ).toBe(true)
    expect(isSafeBrowserCheckInPattern("(a+)+$")).toBe(false)
    expect(isSafeBrowserCheckInPattern("[")).toBe(false)
  })

  it("rejects invalid or overlong executable fields", () => {
    expect(
      isBrowserCheckInConfig({
        ...VALID_BROWSER_CONFIG,
        action: {
          kind: "click_selector",
          selector: "x".repeat(501),
        },
      }),
    ).toBe(false)
    expect(
      isBrowserCheckInConfig({
        ...VALID_BROWSER_CONFIG,
        success: { textPattern: "x".repeat(201) },
      }),
    ).toBe(false)
    expect(
      isBrowserCheckInConfig({
        ...VALID_BROWSER_CONFIG,
        timeoutMs: 999,
      }),
    ).toBe(false)
    expect(
      isValidBrowserCheckInTaskContract({
        action: VALID_BROWSER_CONFIG.action,
        success: {},
      }),
    ).toBe(false)
  })

  it("normalizes persisted values, clamps timeouts, and drops unknown fields", () => {
    const normalized = normalizeBrowserCheckInConfig({
      ...VALID_BROWSER_CONFIG,
      timeoutMs: 999_999,
      unexpected: "ignored",
      action: {
        ...VALID_BROWSER_CONFIG.action,
        unexpected: "ignored",
      },
    })

    expect(normalized).toMatchObject({
      enabled: true,
      action: VALID_BROWSER_CONFIG.action,
      success: VALID_BROWSER_CONFIG.success,
      identity: VALID_BROWSER_CONFIG.identity,
      timeoutMs: 120_000,
    })
    expect(normalized).not.toHaveProperty("unexpected")
    expect(normalized?.action).not.toHaveProperty("unexpected")
    expect(isBrowserCheckInConfig(DEFAULT_BROWSER_CHECK_IN_CONFIG)).toBe(false)
  })

  it("registers a configured method and removes it when the configuration is disabled", () => {
    const configured = ensureBrowserAutomationMethodState(
      createConfiguredCheckIn(),
    )
    const methodId = AUTO_CHECKIN_METHOD_IDS.BrowserAutomationDailyCheckIn
    expect(configured.methodKnowledge.methods[methodId]?.detection).toEqual({
      outcome: "matched",
      evidence: { source: "user_configuration" },
    })
    expect(configured.selection).toEqual({
      mode: CHECK_IN_SELECTION_MODES.Automatic,
      methodId,
    })

    const disabled = syncBrowserAutomationMethodState(
      ensureBrowserAutomationMethodState(
        createConfiguredCheckIn({ ...VALID_BROWSER_CONFIG, enabled: false }),
      ),
    )
    expect(disabled.methodKnowledge.methods[methodId]).toBeUndefined()
    expect(disabled.selection).toEqual({
      mode: CHECK_IN_SELECTION_MODES.Automatic,
    })
  })

  it("does not override an existing matched method when adding browser automation", () => {
    const existingMethod = AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
    const config = buildCheckInConfig({
      customCheckIn: createConfiguredCheckIn().customCheckIn,
      methodKnowledge: {
        methods: {
          [existingMethod]: {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 1 },
            },
          },
        },
      },
      selection: { mode: CHECK_IN_SELECTION_MODES.Automatic },
    })

    const updated = ensureBrowserAutomationMethodState(config)
    expect(updated.selection).toEqual({
      mode: CHECK_IN_SELECTION_MODES.Automatic,
    })
    expect(updated.methodKnowledge.methods[existingMethod]).toBeDefined()
    expect(
      updated.methodKnowledge.methods[
        AUTO_CHECKIN_METHOD_IDS.BrowserAutomationDailyCheckIn
      ],
    ).toBeDefined()
  })
})
