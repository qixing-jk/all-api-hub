import { describe, expect, it } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configCodec"
import {
  inspectCheckInMethods,
  mergeCheckInDiscoveryResults,
  setCheckInSelection,
} from "~/services/checkin/autoCheckin/domain"
import type {
  CheckInConfig,
  CheckInMethodDetection,
  CheckInMethodId,
} from "~/types/checkIn"

const NEW_API_METHOD_ID = AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
const VELOERA_METHOD_ID = AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn
const ANYROUTER_METHOD_ID = AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn

function createConfig(
  detections: Partial<Record<CheckInMethodId, CheckInMethodDetection>>,
): CheckInConfig {
  return {
    automaticExecutionEnabled: true,
    methodKnowledge: {
      methods: Object.fromEntries(
        Object.entries(detections).map(([methodId, detection]) => [
          methodId,
          { detection },
        ]),
      ),
    },
    selection: { mode: "automatic" as const },
  }
}

const matched: CheckInMethodDetection = {
  outcome: "matched",
  evidence: { source: "probe", observedAt: 100 },
}

const unsupported: CheckInMethodDetection = {
  outcome: "unsupported",
  evidence: { source: "probe", observedAt: 100 },
}

const unknown: CheckInMethodDetection = {
  outcome: "unknown",
  reason: "network",
  attemptedAt: 100,
}

describe("inspectCheckInMethods", () => {
  it.each([
    {
      name: "no registered candidates",
      candidates: [],
      detections: {},
      expected: "unsupported",
    },
    {
      name: "every candidate is unsupported",
      candidates: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: unsupported,
        [VELOERA_METHOD_ID]: unsupported,
      },
      expected: "unsupported",
    },
    {
      name: "exactly one candidate is matched",
      candidates: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: matched,
        [VELOERA_METHOD_ID]: unsupported,
      },
      expected: "resolved",
    },
    {
      name: "multiple candidates are matched",
      candidates: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: matched,
        [VELOERA_METHOD_ID]: matched,
      },
      expected: "ambiguous",
    },
    {
      name: "a match is incomplete while another candidate is unknown",
      candidates: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: matched,
        [VELOERA_METHOD_ID]: unknown,
      },
      expected: "unknown",
    },
    {
      name: "no candidate is matched and one is unknown",
      candidates: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: unsupported,
        [VELOERA_METHOD_ID]: unknown,
      },
      expected: "unknown",
    },
    {
      name: "a candidate entry is missing from otherwise definitive knowledge",
      candidates: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: matched,
      },
      expected: "unknown",
    },
    {
      name: "multiple matches remain ambiguous when another candidate is unknown",
      candidates: [NEW_API_METHOD_ID, VELOERA_METHOD_ID, ANYROUTER_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: matched,
        [VELOERA_METHOD_ID]: matched,
        [ANYROUTER_METHOD_ID]: unknown,
      },
      expected: "ambiguous",
    },
  ])("derives the complete Decision matrix: $name", (testCase) => {
    const state = inspectCheckInMethods({
      config: createConfig(testCase.detections),
      candidateMethodIds: testCase.candidates,
    })

    expect(state.decision.outcome).toBe(testCase.expected)
    if (state.decision.outcome === "resolved") {
      expect(state.decision.methodId).toBe(NEW_API_METHOD_ID)
    }
  })

  it("keeps an established selected match executable when an unrelated candidate is unknown", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: matched,
      [VELOERA_METHOD_ID]: unknown,
    })
    config.selection = {
      mode: "automatic",
      methodId: NEW_API_METHOD_ID,
    }

    const state = inspectCheckInMethods({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
    })

    expect(state.decision.outcome).toBe("unknown")
    expect(state.selectionState).toEqual({
      mode: "automatic",
      status: "selected",
      methodId: NEW_API_METHOD_ID,
    })
    expect(state.executionEligibility).toEqual({
      eligible: true,
      methodId: NEW_API_METHOD_ID,
    })
    expect(state.rediscoveryRecommended).toBe(true)
    expect(state.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          methodId: NEW_API_METHOD_ID,
          selected: true,
          detectionOutcome: "matched",
        }),
        expect.objectContaining({
          methodId: VELOERA_METHOD_ID,
          selected: false,
          detectionOutcome: "unknown",
        }),
      ]),
    )
  })

  it("deduplicates candidates before deriving choices and Decision", () => {
    const state = inspectCheckInMethods({
      config: createConfig({ [NEW_API_METHOD_ID]: matched }),
      candidateMethodIds: [NEW_API_METHOD_ID, NEW_API_METHOD_ID],
    })

    expect(state.decision).toEqual({
      outcome: "resolved",
      methodId: NEW_API_METHOD_ID,
    })
    expect(state.choices).toHaveLength(1)
    expect(state.choices[0]?.methodId).toBe(NEW_API_METHOD_ID)
  })

  it("does not execute a syntax-safe selection that is unknown to this build", () => {
    const config = normalizeCheckInConfigV7({
      automaticExecutionEnabled: true,
      methodKnowledge: {
        methods: {
          "future-method:daily-checkin": {
            detection: matched,
          },
        },
      },
      selection: {
        mode: "manual",
        methodId: "future-method:daily-checkin",
      },
    })

    const state = inspectCheckInMethods({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID],
    })

    expect(state.selectionState).toEqual({
      mode: "manual",
      status: "stale",
      methodId: "future-method:daily-checkin",
      reason: "method_unavailable",
    })
    expect(state.executionEligibility).toEqual({
      eligible: false,
      skipReason: "method_unavailable",
    })
  })

  it("recommends rediscovery when legacy evidence has no full-discovery boundary", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: {
        outcome: "matched",
        evidence: { source: "legacy_migration" },
      },
    })
    config.selection = {
      mode: "automatic",
      methodId: NEW_API_METHOD_ID,
    }

    const state = inspectCheckInMethods({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID],
    })

    expect(state.executionEligibility.eligible).toBe(true)
    expect(state.rediscoveryRecommended).toBe(true)
  })

  it("does not let migrated display status change legacy scheduler eligibility", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: {
        outcome: "matched",
        evidence: { source: "legacy_migration" },
      },
    })
    config.selection = {
      mode: "automatic",
      methodId: NEW_API_METHOD_ID,
    }
    config.methodKnowledge.methods[NEW_API_METHOD_ID]!.status = {
      outcome: "known",
      today: "checked",
      evidence: { source: "legacy_migration" },
    }

    expect(
      inspectCheckInMethods({
        config,
        candidateMethodIds: [NEW_API_METHOD_ID],
      }).executionEligibility,
    ).toEqual({ eligible: true, methodId: NEW_API_METHOD_ID })
  })

  it.each(["probe", "execution"] as const)(
    "uses %s checked status only on the local day when it was observed",
    (source) => {
      const observedAt = Date.parse("2026-08-20T23:30:00.000Z")
      const config = createConfig({ [NEW_API_METHOD_ID]: matched })
      config.selection = {
        mode: "automatic",
        methodId: NEW_API_METHOD_ID,
      }
      config.methodKnowledge.methods[NEW_API_METHOD_ID]!.status = {
        outcome: "known",
        today: "checked",
        evidence: { source, observedAt },
      }

      expect(
        inspectCheckInMethods({
          config,
          candidateMethodIds: [NEW_API_METHOD_ID],
          now: Date.parse("2026-08-21T00:30:00.000Z"),
          timeZone: "Asia/Singapore",
        }).executionEligibility,
      ).toEqual({ eligible: false, skipReason: "already_checked" })

      expect(
        inspectCheckInMethods({
          config,
          candidateMethodIds: [NEW_API_METHOD_ID],
          now: Date.parse("2026-08-21T16:30:00.000Z"),
          timeZone: "Asia/Singapore",
        }).executionEligibility,
      ).toEqual({ eligible: true, methodId: NEW_API_METHOD_ID })
    },
  )

  it.each([
    {
      name: "account disabled",
      input: { accountDisabled: true },
      config: createConfig({ [NEW_API_METHOD_ID]: matched }),
      expected: "account_disabled",
    },
    {
      name: "global automatic execution disabled",
      input: { globalAutomaticExecutionEnabled: false },
      config: createConfig({ [NEW_API_METHOD_ID]: matched }),
      expected: "global_automatic_execution_disabled",
    },
    {
      name: "account automatic execution disabled",
      input: {},
      config: {
        ...createConfig({ [NEW_API_METHOD_ID]: matched }),
        automaticExecutionEnabled: false,
      },
      expected: "automatic_execution_disabled",
    },
    {
      name: "selected candidate has no definitive match",
      input: {},
      config: createConfig({ [NEW_API_METHOD_ID]: unknown }),
      expected: "method_not_matched",
    },
    {
      name: "selected candidate is unsupported",
      input: {},
      config: createConfig({ [NEW_API_METHOD_ID]: unsupported }),
      expected: "method_unsupported",
    },
    {
      name: "method disabled by the deployment",
      input: {},
      config: {
        ...createConfig({ [NEW_API_METHOD_ID]: matched }),
        methodKnowledge: {
          methods: {
            [NEW_API_METHOD_ID]: {
              detection: matched,
              status: {
                outcome: "known" as const,
                availability: "disabled" as const,
                evidence: { source: "probe" as const, observedAt: 100 },
              },
            },
          },
        },
      },
      expected: "method_disabled",
    },
    {
      name: "already checked today",
      input: {},
      config: {
        ...createConfig({ [NEW_API_METHOD_ID]: matched }),
        methodKnowledge: {
          methods: {
            [NEW_API_METHOD_ID]: {
              detection: matched,
              status: {
                outcome: "known" as const,
                today: "checked" as const,
                evidence: { source: "probe" as const, observedAt: 100 },
              },
            },
          },
        },
      },
      expected: "already_checked",
    },
  ])("derives the execution skip reason for $name", (testCase) => {
    testCase.config.selection = {
      mode: "automatic",
      methodId: NEW_API_METHOD_ID,
    }

    const state = inspectCheckInMethods({
      config: testCase.config,
      candidateMethodIds: [NEW_API_METHOD_ID],
      now: 100,
      timeZone: "UTC",
      ...testCase.input,
    })

    expect(state.executionEligibility).toEqual({
      eligible: false,
      skipReason: testCase.expected,
    })
  })
})

describe("setCheckInSelection", () => {
  it("keeps a manual choice sticky and restores the uniquely resolved automatic choice", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: matched,
      [VELOERA_METHOD_ID]: unsupported,
    })

    const manual = setCheckInSelection({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      selection: { mode: "manual", methodId: VELOERA_METHOD_ID },
    })
    expect(manual.selection).toEqual({
      mode: "manual",
      methodId: VELOERA_METHOD_ID,
    })

    const automatic = setCheckInSelection({
      config: manual,
      candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      selection: { mode: "automatic" as const },
    })
    expect(automatic.selection).toEqual({
      mode: "automatic",
      methodId: NEW_API_METHOD_ID,
    })
  })

  it("restores automatic mode without inventing a choice when Decision is incomplete", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: matched,
      [VELOERA_METHOD_ID]: unknown,
    })
    config.selection = {
      mode: "manual",
      methodId: NEW_API_METHOD_ID,
    }

    const automatic = setCheckInSelection({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      selection: { mode: "automatic" as const },
    })

    expect(automatic.selection).toEqual({ mode: "automatic" })
  })
})

describe("mergeCheckInDiscoveryResults", () => {
  it("replaces prior evidence with authoritative results and clears an older unknown attempt", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: {
        ...matched,
        lastUnknownAttempt: { reason: "timeout", attemptedAt: 110 },
      },
    })

    const merged = mergeCheckInDiscoveryResults({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: {
          outcome: "unsupported",
          evidence: { source: "probe", observedAt: 200 },
        },
      },
      completedAt: 200,
    })

    expect(
      merged.methodKnowledge.methods[NEW_API_METHOD_ID]?.detection,
    ).toEqual({
      outcome: "unsupported",
      evidence: { source: "probe", observedAt: 200 },
    })
    expect(merged.methodKnowledge.lastFullDiscoveryAt).toBe(200)
  })

  it("retains definitive facts for temporary and missing unknown results", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: matched,
      [VELOERA_METHOD_ID]: unsupported,
    })
    config.selection = {
      mode: "automatic",
      methodId: NEW_API_METHOD_ID,
    }

    const merged = mergeCheckInDiscoveryResults({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: {
          outcome: "unknown",
          reason: "network",
          attemptedAt: 300,
        },
      },
      completedAt: 300,
    })

    expect(
      merged.methodKnowledge.methods[NEW_API_METHOD_ID]?.detection,
    ).toEqual({
      ...matched,
      lastUnknownAttempt: { reason: "network", attemptedAt: 300 },
    })
    expect(
      merged.methodKnowledge.methods[VELOERA_METHOD_ID]?.detection,
    ).toEqual({
      ...unsupported,
      lastUnknownAttempt: {
        reason: "invalid_response",
        attemptedAt: 300,
      },
    })
    expect(merged.selection).toEqual({
      mode: "automatic",
      methodId: NEW_API_METHOD_ID,
    })
    expect(
      inspectCheckInMethods({
        config: merged,
        candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      }),
    ).toMatchObject({
      decision: { outcome: "unknown" },
      executionEligibility: {
        eligible: true,
        methodId: NEW_API_METHOD_ID,
      },
    })
  })

  it("never replaces a manual selection and only reselects an unsupported automatic method", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: matched,
      [VELOERA_METHOD_ID]: unsupported,
    })
    config.selection = {
      mode: "manual",
      methodId: NEW_API_METHOD_ID,
    }

    const detections = {
      [NEW_API_METHOD_ID]: unsupported,
      [VELOERA_METHOD_ID]: matched,
    }
    const manual = mergeCheckInDiscoveryResults({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections,
      completedAt: 400,
    })
    expect(manual.selection).toEqual({
      mode: "manual",
      methodId: NEW_API_METHOD_ID,
    })

    const automatic = mergeCheckInDiscoveryResults({
      config: {
        ...config,
        selection: { mode: "automatic", methodId: NEW_API_METHOD_ID },
      },
      candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections,
      completedAt: 400,
    })
    expect(automatic.selection).toEqual({
      mode: "automatic",
      methodId: VELOERA_METHOD_ID,
    })
  })

  it("reselects a resolved automatic method when the persisted method is no longer a candidate", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: matched,
      [VELOERA_METHOD_ID]: matched,
    })
    config.selection = {
      mode: "automatic",
      methodId: VELOERA_METHOD_ID,
    }

    const merged = mergeCheckInDiscoveryResults({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID],
      detections: { [NEW_API_METHOD_ID]: matched },
      completedAt: 450,
    })

    expect(merged.selection).toEqual({
      mode: "automatic",
      methodId: NEW_API_METHOD_ID,
    })
  })

  it("does not revoke a still-matched automatic selection when discovery becomes ambiguous", () => {
    const config = createConfig({
      [NEW_API_METHOD_ID]: matched,
      [VELOERA_METHOD_ID]: unsupported,
    })
    config.selection = {
      mode: "automatic",
      methodId: NEW_API_METHOD_ID,
    }

    const merged = mergeCheckInDiscoveryResults({
      config,
      candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      detections: {
        [NEW_API_METHOD_ID]: matched,
        [VELOERA_METHOD_ID]: matched,
      },
      completedAt: 500,
    })

    expect(merged.selection).toEqual(config.selection)
    expect(
      inspectCheckInMethods({
        config: merged,
        candidateMethodIds: [NEW_API_METHOD_ID, VELOERA_METHOD_ID],
      }).executionEligibility,
    ).toEqual({ eligible: true, methodId: NEW_API_METHOD_ID })
  })
})

describe("normalizeCheckInConfigV7", () => {
  it("retains a storage-safe opaque selection ID but drops unknown knowledge keys", () => {
    const rawMethods = JSON.parse(`{
      "future-method:daily-checkin": {
        "detection": {
          "outcome": "matched",
          "evidence": { "source": "legacy_migration" }
        }
      },
      "__proto__": {
        "detection": {
          "outcome": "matched",
          "evidence": { "source": "legacy_migration" }
        }
      },
      "missing-namespace": {
        "detection": {
          "outcome": "matched",
          "evidence": { "source": "legacy_migration" }
        }
      },
      "Uppercase:daily-checkin": {
        "detection": {
          "outcome": "matched",
          "evidence": { "source": "legacy_migration" }
        }
      }
    }`)

    const normalized = normalizeCheckInConfigV7({
      automaticExecutionEnabled: true,
      methodKnowledge: { methods: rawMethods },
      selection: {
        mode: "manual",
        methodId: "future-method:daily-checkin",
      },
    })

    expect(Object.keys(normalized.methodKnowledge.methods)).toEqual([])
    expect(Object.getPrototypeOf(normalized.methodKnowledge.methods)).toBeNull()
    expect(normalized.selection).toEqual({
      mode: "manual",
      methodId: "future-method:daily-checkin",
    })
  })

  it("does not turn a malformed selection mode into an automatic choice", () => {
    const normalized = normalizeCheckInConfigV7({
      automaticExecutionEnabled: true,
      methodKnowledge: {
        methods: {
          [NEW_API_METHOD_ID]: { detection: matched },
        },
      },
      selection: { mode: "corrupt", methodId: NEW_API_METHOD_ID },
    })

    expect(normalized.selection).toEqual({ mode: "automatic" })
    expect(
      inspectCheckInMethods({
        config: normalized,
        candidateMethodIds: [NEW_API_METHOD_ID],
      }).executionEligibility,
    ).toEqual({ eligible: false, skipReason: "no_selected_method" })
  })

  it("drops an invalid custom check-in record that has no canonical fields", () => {
    const normalized = normalizeCheckInConfigV7({
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" },
      customCheckIn: { url: 123, unsupportedField: true },
    })

    expect(normalized.customCheckIn).toBeUndefined()
  })

  it.each([
    {
      turnstilePreTrigger: { kind: "none" },
      expected: { kind: "none" },
    },
    {
      turnstilePreTrigger: {
        kind: "checkinButton",
        positivePattern: "claim",
        negativePattern: "claimed",
        candidateSelector: "#claim",
        throttle: { maxAttempts: 2, minIntervalMs: 300 },
      },
      expected: {
        kind: "checkinButton",
        positivePattern: "claim",
        negativePattern: "claimed",
        candidateSelector: "#claim",
        throttle: { maxAttempts: 2, minIntervalMs: 300 },
      },
    },
    {
      turnstilePreTrigger: {
        kind: "clickText",
        positivePattern: "check in",
        negativePattern: "checked in",
        candidateSelector: "button",
        label: "daily check-in",
      },
      expected: {
        kind: "clickText",
        positivePattern: "check in",
        negativePattern: "checked in",
        candidateSelector: "button",
        label: "daily check-in",
      },
    },
  ])(
    "normalizes valid custom Turnstile trigger %#",
    ({ turnstilePreTrigger, expected }) => {
      const normalized = normalizeCheckInConfigV7({
        methodKnowledge: { methods: {} },
        selection: { mode: "automatic" as const },
        customCheckIn: { turnstilePreTrigger },
      })

      expect(normalized.customCheckIn?.turnstilePreTrigger).toEqual(expected)
    },
  )

  it.each([
    { kind: "unknown" },
    { kind: "clickSelector" },
    { kind: "clickText", positivePattern: 12 },
  ])("rejects malformed custom Turnstile trigger %#", (turnstilePreTrigger) => {
    const normalized = normalizeCheckInConfigV7({
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" as const },
      customCheckIn: {
        url: "https://checkin.example.invalid",
        turnstilePreTrigger,
      },
    })

    expect(normalized.customCheckIn).toEqual({
      url: "https://checkin.example.invalid",
    })
  })

  it("normalizes bounded Turnstile throttle values", () => {
    const normalized = normalizeCheckInConfigV7({
      methodKnowledge: { methods: {} },
      selection: { mode: "automatic" as const },
      customCheckIn: {
        turnstilePreTrigger: {
          kind: "clickSelector",
          selector: "#check-in",
          label: 10,
          throttle: {
            maxAttempts: -1,
            minIntervalMs: 250,
          },
        },
      },
    })

    expect(normalized.customCheckIn?.turnstilePreTrigger).toEqual({
      kind: "clickSelector",
      selector: "#check-in",
      throttle: { minIntervalMs: 250 },
    })
  })

  it.each([
    "__proto__",
    "constructor",
    "prototype",
    "missing-namespace",
    "Uppercase:daily-checkin",
    `${"a".repeat(127)}:b`,
  ])("rejects malformed method map key %s", (invalidMethodId) => {
    const methods = Object.create(null) as Record<string, unknown>
    methods[invalidMethodId] = {
      detection: {
        outcome: "matched",
        evidence: { source: "legacy_migration" },
      },
    }

    const normalized = normalizeCheckInConfigV7({
      methodKnowledge: { methods },
      selection: { mode: "automatic" as const },
    })

    expect(Object.keys(normalized.methodKnowledge.methods)).toHaveLength(0)
  })

  it.each([
    {
      name: "coerces finite persisted timestamps",
      detection: {
        outcome: "matched",
        evidence: { source: "probe", observedAt: "120" },
      },
      status: {
        outcome: "known",
        availability: "invalid",
        today: "checked",
        evidence: { source: "execution", observedAt: "121" },
      },
      expectedDetection: {
        outcome: "matched",
        evidence: { source: "probe", observedAt: 120 },
      },
      expectedStatus: {
        outcome: "known",
        today: "checked",
        evidence: { source: "execution", observedAt: 121 },
      },
    },
    {
      name: "bounds unknown reasons to the controlled vocabulary",
      detection: {
        outcome: "unknown",
        reason: "raw_backend_message",
        attemptedAt: 130,
      },
      status: {
        outcome: "unknown",
        reason: "raw_backend_message",
        attemptedAt: 131,
      },
      expectedDetection: {
        outcome: "unknown",
        reason: "invalid_response",
        attemptedAt: 130,
      },
      expectedStatus: {
        outcome: "unknown",
        reason: "invalid_response",
        attemptedAt: 131,
      },
    },
    {
      name: "drops invalid legacy timestamps and calendar day keys",
      detection: {
        outcome: "matched",
        evidence: { source: "legacy_migration" },
      },
      status: {
        outcome: "known",
        today: "not_checked",
        evidence: {
          source: "legacy_migration",
          legacyObservedAt: Number.POSITIVE_INFINITY,
          legacyDayKey: "2026-02-30",
        },
      },
      expectedDetection: {
        outcome: "matched",
        evidence: { source: "legacy_migration" },
      },
      expectedStatus: {
        outcome: "known",
        today: "not_checked",
        evidence: { source: "legacy_migration" },
      },
    },
  ])("$name", (testCase) => {
    const normalized = normalizeCheckInConfigV7({
      automaticExecutionEnabled: true,
      methodKnowledge: {
        methods: {
          [NEW_API_METHOD_ID]: {
            detection: testCase.detection,
            status: testCase.status,
          },
        },
        lastFullDiscoveryAt: "140",
      },
      selection: { mode: "automatic", methodId: NEW_API_METHOD_ID },
    })

    expect(
      normalized.methodKnowledge.methods[NEW_API_METHOD_ID]?.detection,
    ).toEqual(testCase.expectedDetection)
    expect(
      normalized.methodKnowledge.methods[NEW_API_METHOD_ID]?.status,
    ).toEqual(testCase.expectedStatus)
    expect(normalized.methodKnowledge.lastFullDiscoveryAt).toBe(140)
  })

  it("is deterministic and idempotent", () => {
    const input = {
      automaticExecutionEnabled: true,
      methodKnowledge: {
        methods: {
          [NEW_API_METHOD_ID]: { detection: matched },
        },
        lastFullDiscoveryAt: 150,
      },
      selection: { mode: "automatic", methodId: NEW_API_METHOD_ID },
    }

    const first = normalizeCheckInConfigV7(input)
    const second = normalizeCheckInConfigV7(input)

    expect(second).toEqual(first)
    expect(normalizeCheckInConfigV7(first)).toEqual(first)
  })
})
