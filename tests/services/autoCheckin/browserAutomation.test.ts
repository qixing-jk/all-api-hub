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

  it("disables automation instead of dropping an unusable identity guard", () => {
    // Each value is a guard the user supplied but normalization cannot honour.
    // Dropping it would run the action unguarded, because the page treats a
    // missing identity as satisfied.
    const unusableIdentities: unknown[] = [
      { selector: ".account-name" },
      { textPattern: "user@example.com" },
      { selector: "x".repeat(501), textPattern: "user@example.com" },
      { selector: ".account-name", textPattern: "(a+)+$" },
      "not-an-object",
      null,
    ]

    for (const identity of unusableIdentities) {
      const normalized = normalizeBrowserCheckInConfig({
        ...VALID_BROWSER_CONFIG,
        identity,
      })

      expect(normalized?.enabled).toBe(false)
      expect(normalized).not.toHaveProperty("identity")
    }
  })

  it("keeps automation enabled when the optional identity guard is omitted", () => {
    const { identity: _identity, ...withoutIdentity } = VALID_BROWSER_CONFIG
    const normalized = normalizeBrowserCheckInConfig(withoutIdentity)

    expect(normalized?.enabled).toBe(true)
    expect(normalized).not.toHaveProperty("identity")
  })

  it("rejects a click-text action whose supplied candidate selector is unusable", () => {
    const normalized = normalizeBrowserCheckInConfig({
      ...VALID_BROWSER_CONFIG,
      action: {
        kind: "click_text",
        textPattern: "check in",
        candidateSelector: "x".repeat(501),
      },
    })

    // The action must not degrade into an unbounded click over every candidate.
    expect(normalized?.enabled).toBe(false)
    expect(normalized?.action).toEqual({ kind: "page_load" })
  })

  it("keeps a click-text action with a valid or absent candidate selector", () => {
    const withSelector = normalizeBrowserCheckInConfig({
      ...VALID_BROWSER_CONFIG,
      action: {
        kind: "click_text",
        textPattern: "check in",
        candidateSelector: ".actions",
      },
    })
    expect(withSelector?.enabled).toBe(true)
    expect(withSelector?.action).toEqual({
      kind: "click_text",
      textPattern: "check in",
      candidateSelector: ".actions",
    })

    // An absent selector is the supported default: search the documented
    // candidate set, rather than a silently narrowed one.
    const withoutSelector = normalizeBrowserCheckInConfig({
      ...VALID_BROWSER_CONFIG,
      action: { kind: "click_text", textPattern: "check in" },
    })
    expect(withoutSelector?.enabled).toBe(true)
    expect(withoutSelector?.action).toEqual({
      kind: "click_text",
      textPattern: "check in",
    })
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
