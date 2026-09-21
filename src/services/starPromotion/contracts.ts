/**
 * GitHub star promotion state machine.
 *
 * Mirrors the orca star-nag contract: once the value threshold is crossed the
 * card stays visible until the user resolves it. Every non-star exit (the "not
 * now" button or the close control) is a deferral that cools down, doubles the
 * threshold, and re-baselines. Only starring or confirming an existing star is
 * terminal. All transitions are pure so they can be unit tested independently
 * from storage.
 */

export const STAR_PROMOTION_STATUSES = {
  /** Value threshold may eventually trigger a prompt. */
  Active: "active",
  /** User starred the repository (confirmed, self-reported, or detected). */
  Completed: "completed",
} as const

/** Discriminator for promotion completion: completed state suppresses all CTAs. */
export type StarPromotionStatus =
  (typeof STAR_PROMOTION_STATUSES)[keyof typeof STAR_PROMOTION_STATUSES]

export const STAR_PROMOTION_INITIAL_THRESHOLD = 30
const STAR_PROMOTION_THRESHOLD_GROWTH_FACTOR = 2
/**
 * Distinct accounts a user must add since the last deferral before the
 * setup-commitment signal alone justifies a prompt.
 */
export const STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD = 5
/**
 * Cooldown applied whenever the user defers a threshold prompt. Short on
 * purpose (orca uses the same 3 days): the real brake is the doubled threshold
 * plus re-baselining both signals, since a deferral refreshes what counts as
 * new value. This only damps re-prompts within a single sitting.
 */
export const STAR_PROMOTION_DEFERRAL_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000

export interface StarPromotionState {
  status: StarPromotionStatus
  /** Lifetime successful auto check-ins across all runs. */
  lifetimeCheckinSuccesses: number
  /**
   * Lifetime counter value at the last threshold reset. Prompts compare the
   * delta against nextThreshold so deferrals always require fresh value.
   */
  baselineCheckinSuccesses: number
  /**
   * Successful check-ins needed since the baseline before the next threshold
   * prompt becomes eligible.
   */
  nextThreshold: number
  /**
   * Managed-account count at the last threshold reset. Accounts are a stock
   * metric, so without this baseline a user who already manages many accounts
   * would trip every escalated threshold at once and be re-prompted on every
   * cooldown expiry. Comparing against the baseline makes growth, not the
   * absolute count, the qualifier.
   */
  baselineAccountCount: number
  /** Additional managed accounts needed since the baseline. */
  nextAccountThreshold: number
  /** Timestamp until which threshold prompts stay suppressed. */
  deferredUntil?: number
}

/** Creates the initial promotion state used by fresh installs. */
export function createDefaultStarPromotionState(): StarPromotionState {
  return {
    status: STAR_PROMOTION_STATUSES.Active,
    lifetimeCheckinSuccesses: 0,
    baselineCheckinSuccesses: 0,
    nextThreshold: STAR_PROMOTION_INITIAL_THRESHOLD,
    baselineAccountCount: 0,
    nextAccountThreshold: STAR_PROMOTION_INITIAL_ACCOUNT_THRESHOLD,
  }
}

/** Normalizes a raw stored state, falling back to defaults on invalid data. */
export function normalizeStarPromotionState(raw: unknown): StarPromotionState {
  const defaults = createDefaultStarPromotionState()
  if (typeof raw !== "object" || raw === null) {
    return defaults
  }

  const source = raw as Partial<StarPromotionState>
  const toFiniteNumber = (value: unknown, fallback: number) => {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : fallback
  }

  return {
    status:
      source.status === STAR_PROMOTION_STATUSES.Completed
        ? STAR_PROMOTION_STATUSES.Completed
        : STAR_PROMOTION_STATUSES.Active,
    lifetimeCheckinSuccesses: toFiniteNumber(
      source.lifetimeCheckinSuccesses,
      defaults.lifetimeCheckinSuccesses,
    ),
    baselineCheckinSuccesses: toFiniteNumber(
      source.baselineCheckinSuccesses,
      defaults.baselineCheckinSuccesses,
    ),
    nextThreshold: toFiniteNumber(source.nextThreshold, defaults.nextThreshold),
    baselineAccountCount: toFiniteNumber(
      source.baselineAccountCount,
      defaults.baselineAccountCount,
    ),
    nextAccountThreshold: toFiniteNumber(
      source.nextAccountThreshold,
      defaults.nextAccountThreshold,
    ),
    deferredUntil: toFiniteNumber(source.deferredUntil, -1) || undefined,
  }
}

/**
 * Accumulates successful check-ins. `ALREADY_CHECKED` outcomes count too: the
 * user still harvested the value of the scheduled check-in.
 */
export function addCheckinSuccessesOnState(
  state: StarPromotionState,
  count: number,
): StarPromotionState {
  if (!Number.isFinite(count) || count <= 0) {
    return state
  }

  return {
    ...state,
    lifetimeCheckinSuccesses: state.lifetimeCheckinSuccesses + count,
  }
}

/**
 * Resolves the account baseline used for the growth comparison. The baseline
 * only ever follows the live count downwards: deleting accounts is the user's
 * own housekeeping, so it must never strand them below an old high-water mark
 * and permanently disqualify them from a future prompt.
 */
export function resolveAccountBaseline(
  state: StarPromotionState,
  accountCount: number | undefined,
): number {
  if (typeof accountCount !== "number") {
    return state.baselineAccountCount
  }

  return Math.min(state.baselineAccountCount, accountCount)
}

/**
 * Checks whether the promotion card should be visible. Two signals qualify,
 * OR: fresh check-in value since the baseline, or enough accounts added since
 * the baseline. The card is persistent, so there is no per-version gate — it
 * stays up until the user resolves it with a terminal action (star / already
 * starred) or defers it.
 */
export function shouldShowThresholdPromptOnState(
  state: StarPromotionState,
  input: { now: number; accountCount?: number },
): boolean {
  if (state.status === STAR_PROMOTION_STATUSES.Completed) {
    return false
  }

  if (
    typeof state.deferredUntil === "number" &&
    state.deferredUntil > input.now
  ) {
    return false
  }

  const checkinSignalMet =
    state.lifetimeCheckinSuccesses - state.baselineCheckinSuccesses >=
    state.nextThreshold
  const accountSignalMet =
    typeof input.accountCount === "number" &&
    input.accountCount - resolveAccountBaseline(state, input.accountCount) >=
      state.nextAccountThreshold

  return checkinSignalMet || accountSignalMet
}

/**
 * Applies a non-star exit ("not now" or the close control): cool down, double
 * both thresholds, and re-baseline both signals so the user must earn fresh
 * value before the next ask.
 */
export function deferThresholdPromptOnState(
  state: StarPromotionState,
  input: { now: number; accountCount?: number },
): StarPromotionState {
  return {
    ...state,
    deferredUntil: input.now + STAR_PROMOTION_DEFERRAL_COOLDOWN_MS,
    baselineCheckinSuccesses: state.lifetimeCheckinSuccesses,
    nextThreshold: state.nextThreshold * STAR_PROMOTION_THRESHOLD_GROWTH_FACTOR,
    baselineAccountCount:
      typeof input.accountCount === "number"
        ? input.accountCount
        : state.baselineAccountCount,
    nextAccountThreshold:
      state.nextAccountThreshold * STAR_PROMOTION_THRESHOLD_GROWTH_FACTOR,
  }
}

/** Terminal state: every star CTA surface stays suppressed afterwards. */
export function completeStarPromotionOnState(
  state: StarPromotionState,
): StarPromotionState {
  return { ...state, status: STAR_PROMOTION_STATUSES.Completed }
}
