import { describe, expect, it } from "vitest"

import {
  addCheckinSuccessesOnState,
  completeStarPromotionOnState,
  createDefaultStarPromotionState,
  deferThresholdPromptOnState,
  normalizeStarPromotionState,
  resolveAccountBaseline,
  shouldShowThresholdPromptOnState,
  STAR_PROMOTION_DEFERRAL_COOLDOWN_MS,
  STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD,
  STAR_PROMOTION_INITIAL_THRESHOLD,
  STAR_PROMOTION_STATUSES,
} from "~/services/starPromotion/contracts"

function buildState(
  overrides: Partial<ReturnType<typeof createDefaultStarPromotionState>> = {},
) {
  return { ...createDefaultStarPromotionState(), ...overrides }
}

describe("star promotion state transitions", () => {
  it("does not prompt below the initial threshold", () => {
    const state = addCheckinSuccessesOnState(
      buildState(),
      STAR_PROMOTION_INITIAL_THRESHOLD - 1,
    )

    expect(shouldShowThresholdPromptOnState(state, { now: 1_000 })).toBe(false)
  })

  it("keeps the card due until the user resolves or defers it", () => {
    const state = addCheckinSuccessesOnState(
      buildState(),
      STAR_PROMOTION_INITIAL_THRESHOLD,
    )

    // Re-evaluating (every Options mount) must keep returning the same answer;
    // the persistent card is dismissed by user action, not by being seen.
    expect(shouldShowThresholdPromptOnState(state, { now: 1_000 })).toBe(true)
    expect(shouldShowThresholdPromptOnState(state, { now: 2_000 })).toBe(true)
  })

  it("never prompts after completion", () => {
    const state = completeStarPromotionOnState(
      addCheckinSuccessesOnState(buildState(), 1_000),
    )

    expect(shouldShowThresholdPromptOnState(state, { now: 1_000 })).toBe(false)
  })

  it("either dismissal cools down, doubles both thresholds, and re-baselines", () => {
    const now = 1_000
    const state = addCheckinSuccessesOnState(
      buildState({ nextThreshold: STAR_PROMOTION_INITIAL_THRESHOLD }),
      STAR_PROMOTION_INITIAL_THRESHOLD,
    )
    const deferred = deferThresholdPromptOnState(state, { now })

    expect(deferred.deferredUntil).toBe(
      now + STAR_PROMOTION_DEFERRAL_COOLDOWN_MS,
    )
    expect(deferred.nextThreshold).toBe(STAR_PROMOTION_INITIAL_THRESHOLD * 2)
    expect(deferred.nextAccountThreshold).toBe(
      STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD * 2,
    )
    expect(deferred.baselineCheckinSuccesses).toBe(
      STAR_PROMOTION_INITIAL_THRESHOLD,
    )

    // Within the cooldown no prompt shows even with fresh value.
    const withFreshValue = addCheckinSuccessesOnState(deferred, 1_000)
    expect(
      shouldShowThresholdPromptOnState(withFreshValue, { now: now + 1_000 }),
    ).toBe(false)

    // After the cooldown the doubled threshold must be earned first.
    const afterCooldown = addCheckinSuccessesOnState(deferred, 59)
    expect(
      shouldShowThresholdPromptOnState(afterCooldown, {
        now: now + STAR_PROMOTION_DEFERRAL_COOLDOWN_MS + 1,
      }),
    ).toBe(false)
    const beyondDoubledThreshold = addCheckinSuccessesOnState(deferred, 60)
    expect(
      shouldShowThresholdPromptOnState(beyondDoubledThreshold, {
        now: now + STAR_PROMOTION_DEFERRAL_COOLDOWN_MS + 1,
      }),
    ).toBe(true)
  })

  it("ignores non-positive success counts", () => {
    const state = buildState({ lifetimeCheckinSuccesses: 5 })

    expect(addCheckinSuccessesOnState(state, 0)).toBe(state)
    expect(addCheckinSuccessesOnState(state, -1)).toBe(state)
  })

  it("does not qualify accounts that existed when storage was initialized", () => {
    const initializedState = buildState({ baselineAccountCount: 30 })

    expect(
      shouldShowThresholdPromptOnState(initializedState, {
        now: 1_000,
        accountCount: 30,
      }),
    ).toBe(false)
  })

  it("prompts when the managed account count alone reaches its threshold", () => {
    const state = buildState()

    expect(
      shouldShowThresholdPromptOnState(state, {
        now: 1_000,
        accountCount: STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD - 1,
      }),
    ).toBe(false)
    expect(
      shouldShowThresholdPromptOnState(state, {
        now: 1_000,
        accountCount: STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD,
      }),
    ).toBe(true)
    expect(
      shouldShowThresholdPromptOnState(state, {
        now: 1_000,
        accountCount: undefined,
      }),
    ).toBe(false)
  })

  it("deferral escalates the account threshold and re-baselines the count", () => {
    const state = buildState()
    const deferred = deferThresholdPromptOnState(state, {
      now: 1_000,
      accountCount: 20,
    })
    const afterCooldown = 1_000 + STAR_PROMOTION_DEFERRAL_COOLDOWN_MS + 1

    expect(deferred.baselineAccountCount).toBe(20)
    expect(deferred.nextAccountThreshold).toBe(
      STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD * 2,
    )

    // A user who already manages many accounts must not re-trip the escalated
    // threshold on cooldown expiry: only *additional* accounts qualify.
    expect(
      shouldShowThresholdPromptOnState(deferred, {
        now: afterCooldown,
        accountCount: 20,
      }),
    ).toBe(false)
    expect(
      shouldShowThresholdPromptOnState(deferred, {
        now: afterCooldown,
        accountCount: 29,
      }),
    ).toBe(false)
    expect(
      shouldShowThresholdPromptOnState(deferred, {
        now: afterCooldown,
        accountCount: 30,
      }),
    ).toBe(true)
  })

  it("keeps the account baseline when the live count is unknown at deferral", () => {
    const state = buildState({ baselineAccountCount: 3 })
    const deferred = deferThresholdPromptOnState(state, { now: 1_000 })

    expect(deferred.baselineAccountCount).toBe(3)
  })

  it("lowers the baseline when the user deletes accounts", () => {
    // Deferring at 20 accounts anchors future asks to that peak.
    const deferred = deferThresholdPromptOnState(buildState(), {
      now: 1_000,
      accountCount: 20,
    })
    const afterCooldown = 1_000 + STAR_PROMOTION_DEFERRAL_COOLDOWN_MS + 1

    // A count at or above the baseline leaves it alone: 10 more accounts.
    expect(resolveAccountBaseline(deferred, 20)).toBe(20)
    expect(resolveAccountBaseline(deferred, 30)).toBe(20)
    expect(
      shouldShowThresholdPromptOnState(deferred, {
        now: afterCooldown,
        accountCount: 30,
      }),
    ).toBe(true)

    // Pruning below the peak lowers the baseline. `isThresholdPromptDue`
    // persists this, so the follow-up comparison uses the lowered value.
    expect(resolveAccountBaseline(deferred, 18)).toBe(18)
    const afterPruning = {
      ...deferred,
      baselineAccountCount: resolveAccountBaseline(deferred, 18),
    }

    // Only 10 accounts on top of the pruned 18 are needed, not 12 to climb
    // back over the old peak.
    expect(
      shouldShowThresholdPromptOnState(afterPruning, {
        now: afterCooldown,
        accountCount: 27,
      }),
    ).toBe(false)
    expect(
      shouldShowThresholdPromptOnState(afterPruning, {
        now: afterCooldown,
        accountCount: 28,
      }),
    ).toBe(true)
  })

  it("leaves the baseline untouched when the live count is unknown", () => {
    const state = buildState({ baselineAccountCount: 20 })

    expect(resolveAccountBaseline(state, undefined)).toBe(20)
  })

  it("normalizes invalid stored state back to defaults", () => {
    expect(normalizeStarPromotionState(undefined)).toEqual(
      createDefaultStarPromotionState(),
    )
    expect(normalizeStarPromotionState("junk")).toEqual(
      createDefaultStarPromotionState(),
    )
    expect(normalizeStarPromotionState(null)).toEqual(
      createDefaultStarPromotionState(),
    )

    const restored = normalizeStarPromotionState({
      status: STAR_PROMOTION_STATUSES.Completed,
      lifetimeCheckinSuccesses: 120,
      baselineCheckinSuccesses: 30,
      nextThreshold: 60,
      baselineAccountCount: 20,
      nextAccountThreshold: 10,
      deferredUntil: 5,
    })
    expect(restored).toEqual({
      status: STAR_PROMOTION_STATUSES.Completed,
      lifetimeCheckinSuccesses: 120,
      baselineCheckinSuccesses: 30,
      nextThreshold: 60,
      baselineAccountCount: 20,
      nextAccountThreshold: 10,
      deferredUntil: 5,
    })
  })

  it("drops the retired per-version gate from legacy stored state", () => {
    const restored = normalizeStarPromotionState({
      status: STAR_PROMOTION_STATUSES.Active,
      lifetimeCheckinSuccesses: 40,
      baselineCheckinSuccesses: 0,
      nextThreshold: 30,
      nextAccountThreshold: 5,
      promptConsumedVersion: "3.62.0",
    })

    expect(restored).not.toHaveProperty("promptConsumedVersion")
    expect(shouldShowThresholdPromptOnState(restored, { now: 1_000 })).toBe(
      true,
    )
  })

  it("falls back to defaults for out-of-range numeric fields", () => {
    const restored = normalizeStarPromotionState({
      lifetimeCheckinSuccesses: -5,
      nextThreshold: 0,
      nextAccountThreshold: -1,
    })

    expect(restored.lifetimeCheckinSuccesses).toBe(0)
    expect(restored.nextThreshold).toBe(STAR_PROMOTION_INITIAL_THRESHOLD)
    expect(restored.nextAccountThreshold).toBe(
      STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD,
    )
    expect(restored.status).toBe(STAR_PROMOTION_STATUSES.Active)
  })
})
