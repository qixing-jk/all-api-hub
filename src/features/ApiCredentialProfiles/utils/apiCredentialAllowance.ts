/**
 * Reduces normalized credential telemetry into a single "how much is left"
 * vocabulary shared by quota windows and monetary balances.
 *
 * Provider telemetry arrives in two very different shapes: coding-plan style
 * windows that already carry a remaining percentage, and wallet style balances
 * that are an absolute amount. Both answer the same user question ("will this
 * key still work tomorrow?"), so the dashboard reduces them to one urgency
 * scale instead of rendering them as unrelated facts.
 */

import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryAmount,
  ApiCredentialTelemetryBalanceFact,
  ApiCredentialTelemetryFacts,
  ApiCredentialTelemetryQuotaWindowFact,
  ApiCredentialTelemetryQuotaWindowType,
} from "~/types/apiCredentialProfiles"

export const API_CREDENTIAL_ALLOWANCE_LEVELS = {
  Critical: "critical",
  Low: "low",
  Normal: "normal",
  Unknown: "unknown",
} as const

export type ApiCredentialAllowanceLevel =
  (typeof API_CREDENTIAL_ALLOWANCE_LEVELS)[keyof typeof API_CREDENTIAL_ALLOWANCE_LEVELS]

/**
 * Quota windows and balance runways are not directly comparable, so each gets
 * thresholds that mean the same thing to a user: "act now" and "keep an eye on
 * it". The runway thresholds assume a mostly-daily coding workload.
 */
const API_CREDENTIAL_ALLOWANCE_THRESHOLDS = {
  quotaCriticalRemainingPercent: 20,
  quotaLowRemainingPercent: 50,
  balanceCriticalRunwayDays: 3,
  balanceLowRunwayDays: 7,
  /** Runway that counts as fully comfortable when ranking mixed signals. */
  balanceComfortableRunwayDays: 14,
} as const

export type ApiCredentialQuotaWindowAllowanceSignal = {
  kind: "quota-window"
  id: string
  level: ApiCredentialAllowanceLevel
  /** Lower score means more urgent; only compares signals of equal level. */
  urgency: number
  windowType: ApiCredentialTelemetryQuotaWindowType
  unit: ApiCredentialTelemetryQuotaWindowFact["unit"]
  remainingPercent: number
  used?: number
  limit?: number
  remaining?: number
  resetTime?: number
}

export type ApiCredentialBalanceAllowanceSignal = {
  kind: "balance"
  id: string
  level: ApiCredentialAllowanceLevel
  /** Lower score means more urgent; only compares signals of equal level. */
  urgency: number
  amount: number
  unit: ApiCredentialTelemetryBalanceFact["unit"]
  semantics: ApiCredentialTelemetryBalanceFact["semantics"]
  runwayDays?: number
}

export type ApiCredentialAllowanceSignal =
  | ApiCredentialQuotaWindowAllowanceSignal
  | ApiCredentialBalanceAllowanceSignal

export type ApiCredentialAllowanceCountdown = {
  totalMs: number
  days: number
  hours: number
  minutes: number
  isElapsed: boolean
}

const MILLISECONDS_PER_MINUTE = 60_000
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR

/**
 * Maps an allowance level onto the shared status color tokens so meters,
 * badges, and the overview line all read the same way.
 */
export const API_CREDENTIAL_ALLOWANCE_LEVEL_CLASSES: Record<
  ApiCredentialAllowanceLevel,
  { text: string; indicator: string }
> = {
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Critical]: {
    text: "text-destructive-text",
    indicator: "bg-destructive-indicator",
  },
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Low]: {
    text: "text-warning-text",
    indicator: "bg-warning-indicator",
  },
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Normal]: {
    text: "text-success-text",
    indicator: "bg-success-indicator",
  },
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown]: {
    text: "text-muted-foreground",
    indicator: "bg-neutral-indicator",
  },
}

/** Ordering rank for allowance levels; unknown never outranks a known level. */
const ALLOWANCE_LEVEL_RANK: Record<ApiCredentialAllowanceLevel, number> = {
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Critical]: 3,
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Low]: 2,
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Normal]: 1,
  [API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown]: 0,
}

/** Checks whether two telemetry amounts describe the same unit of measure. */
function hasComparableUnits(
  left: ApiCredentialTelemetryBalanceFact["unit"],
  right: ApiCredentialTelemetryAmount["unit"],
): boolean {
  if (left.kind === "money" && right.kind === "money") {
    return left.currency === right.currency
  }
  if (left.kind === "quota" && right.kind === "quota") {
    return left.code === right.code
  }
  return false
}

/** Classifies a remaining quota percentage into an actionable level. */
export function getQuotaAllowanceLevel(
  remainingPercent: number,
): ApiCredentialAllowanceLevel {
  if (!Number.isFinite(remainingPercent)) {
    return API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown
  }
  if (
    remainingPercent <
    API_CREDENTIAL_ALLOWANCE_THRESHOLDS.quotaCriticalRemainingPercent
  ) {
    return API_CREDENTIAL_ALLOWANCE_LEVELS.Critical
  }
  if (
    remainingPercent <
    API_CREDENTIAL_ALLOWANCE_THRESHOLDS.quotaLowRemainingPercent
  ) {
    return API_CREDENTIAL_ALLOWANCE_LEVELS.Low
  }
  return API_CREDENTIAL_ALLOWANCE_LEVELS.Normal
}

/**
 * Estimates how many days an absolute balance lasts at today's spend rate.
 *
 * Returns `undefined` whenever the two amounts are not the same unit of
 * measure or there is no spend to extrapolate from, so an unanswerable
 * question stays unanswered instead of turning into a made-up number.
 */
export function getBalanceRunwayDays(
  balance: ApiCredentialTelemetryBalanceFact,
  todayCost: ApiCredentialTelemetryAmount | undefined,
): number | undefined {
  if (!todayCost || !Number.isFinite(todayCost.value) || todayCost.value <= 0) {
    return undefined
  }
  if (!hasComparableUnits(balance.unit, todayCost.unit)) return undefined
  if (!Number.isFinite(balance.amount)) return undefined
  return balance.amount / todayCost.value
}

/** Classifies a balance runway into an actionable level. */
export function getBalanceAllowanceLevel(
  runwayDays: number | undefined,
): ApiCredentialAllowanceLevel {
  if (runwayDays === undefined || !Number.isFinite(runwayDays)) {
    return API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown
  }
  if (
    runwayDays < API_CREDENTIAL_ALLOWANCE_THRESHOLDS.balanceCriticalRunwayDays
  ) {
    return API_CREDENTIAL_ALLOWANCE_LEVELS.Critical
  }
  if (runwayDays < API_CREDENTIAL_ALLOWANCE_THRESHOLDS.balanceLowRunwayDays) {
    return API_CREDENTIAL_ALLOWANCE_LEVELS.Low
  }
  return API_CREDENTIAL_ALLOWANCE_LEVELS.Normal
}

/** Builds one signal per quota window, keeping provider order as a tiebreak. */
function buildQuotaAllowanceSignals(
  windows: ApiCredentialTelemetryQuotaWindowFact[],
): ApiCredentialQuotaWindowAllowanceSignal[] {
  return windows.map((window, index) => {
    const level = getQuotaAllowanceLevel(window.remainingPercent)
    return {
      kind: "quota-window",
      id: `quota:${window.type}:${index}`,
      level,
      urgency: Number.isFinite(window.remainingPercent)
        ? window.remainingPercent / 100
        : Number.POSITIVE_INFINITY,
      windowType: window.type,
      unit: window.unit,
      remainingPercent: window.remainingPercent,
      ...(window.used !== undefined ? { used: window.used } : {}),
      ...(window.limit !== undefined ? { limit: window.limit } : {}),
      ...(window.remaining !== undefined
        ? { remaining: window.remaining }
        : {}),
      ...(window.resetTime !== undefined
        ? { resetTime: window.resetTime }
        : {}),
    }
  })
}

/** Builds one signal per balance, using today's spend to estimate a runway. */
function buildBalanceAllowanceSignals(
  balances: ApiCredentialTelemetryBalanceFact[],
  todayCost: ApiCredentialTelemetryAmount | undefined,
): ApiCredentialBalanceAllowanceSignal[] {
  return balances.map((balance, index) => {
    const runwayDays = getBalanceRunwayDays(balance, todayCost)
    return {
      kind: "balance",
      id: `balance:${index}`,
      level: getBalanceAllowanceLevel(runwayDays),
      urgency:
        runwayDays === undefined
          ? Number.POSITIVE_INFINITY
          : runwayDays /
            API_CREDENTIAL_ALLOWANCE_THRESHOLDS.balanceComfortableRunwayDays,
      amount: balance.amount,
      unit: balance.unit,
      semantics: balance.semantics,
      ...(runwayDays !== undefined ? { runwayDays } : {}),
    }
  })
}

/**
 * Reduces normalized facts into allowance signals ordered from most to least
 * urgent, so callers can show the single worst number without inventing a
 * separate ranking for coding-plan and wallet style keys.
 */
export function buildAllowanceSignals(
  facts: ApiCredentialTelemetryFacts | undefined,
): ApiCredentialAllowanceSignal[] {
  if (!facts) return []

  const signals: ApiCredentialAllowanceSignal[] = [
    ...buildQuotaAllowanceSignals(facts.quota?.windows ?? []),
    ...buildBalanceAllowanceSignals(
      facts.balances ?? [],
      facts.usage?.todayCost,
    ),
  ]

  return signals.sort((left, right) => {
    const rankDelta =
      ALLOWANCE_LEVEL_RANK[right.level] - ALLOWANCE_LEVEL_RANK[left.level]
    if (rankDelta !== 0) return rankDelta
    return left.urgency - right.urgency
  })
}

/** Returns the most urgent allowance signal, or nothing when none exists. */
export function getPrimaryAllowanceSignal(
  facts: ApiCredentialTelemetryFacts | undefined,
): ApiCredentialAllowanceSignal | undefined {
  return buildAllowanceSignals(facts)[0]
}

/**
 * Splits the time until a quota window resets into display units.
 *
 * Returns `undefined` for a missing or unusable reset time so callers can omit
 * the countdown instead of claiming a window resets at the epoch.
 */
export function getAllowanceCountdown(
  resetTime: number | undefined,
  now: number,
): ApiCredentialAllowanceCountdown | undefined {
  if (
    resetTime === undefined ||
    !Number.isFinite(resetTime) ||
    resetTime <= 0 ||
    !Number.isFinite(now)
  ) {
    return undefined
  }

  const totalMs = resetTime - now
  if (totalMs <= 0) {
    return { totalMs, days: 0, hours: 0, minutes: 0, isElapsed: true }
  }

  return {
    totalMs,
    days: Math.floor(totalMs / MILLISECONDS_PER_DAY),
    hours: Math.floor((totalMs % MILLISECONDS_PER_DAY) / MILLISECONDS_PER_HOUR),
    minutes: Math.floor(
      (totalMs % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE,
    ),
    isElapsed: false,
  }
}

/**
 * Rounds a runway down to whole days, never below one.
 *
 * Flooring keeps the badge from overstating how long a balance lasts, and the
 * one-day floor avoids reporting a usable balance as "0 days".
 */
export function formatRunwayDays(runwayDays: number): number {
  if (!Number.isFinite(runwayDays)) return 1
  return Math.max(1, Math.floor(runwayDays))
}

export type ApiCredentialAllowanceCountdownDisplayKey =
  | "daysHours"
  | "hoursMinutes"
  | "minutes"
  | "imminent"
  | "elapsed"

export type ApiCredentialAllowanceCountdownDisplay = {
  key: ApiCredentialAllowanceCountdownDisplayKey
  values: { days?: number; hours?: number; minutes?: number }
}

/**
 * Picks the two most significant countdown units so a reset never reads as a
 * wall of numbers. Callers map the key onto a localized sentence.
 */
export function getAllowanceCountdownDisplay(
  countdown: ApiCredentialAllowanceCountdown,
): ApiCredentialAllowanceCountdownDisplay {
  if (countdown.isElapsed) return { key: "elapsed", values: {} }
  if (countdown.days >= 1) {
    return {
      key: "daysHours",
      values: { days: countdown.days, hours: countdown.hours },
    }
  }
  if (countdown.hours >= 1) {
    return {
      key: "hoursMinutes",
      values: { hours: countdown.hours, minutes: countdown.minutes },
    }
  }
  if (countdown.minutes >= 1) {
    return { key: "minutes", values: { minutes: countdown.minutes } }
  }
  return { key: "imminent", values: {} }
}

export type ApiCredentialAllowanceOverview = {
  totalCount: number
  /** Profiles whose telemetry produced at least one allowance signal. */
  monitoredCount: number
  /** Profiles whose most urgent signal is already critical. */
  criticalCount: number
  /** Profiles whose most urgent signal is low but not yet critical. */
  lowCount: number
  mostUrgent?: {
    profileId: string
    profileName: string
    signal: ApiCredentialAllowanceSignal
  }
}

/**
 * Summarizes a whole library into a single "is anything about to run out"
 * headline, which is the part a user actually scans for.
 */
export function buildAllowanceOverview(
  profiles: ApiCredentialProfile[],
): ApiCredentialAllowanceOverview {
  let monitoredCount = 0
  let criticalCount = 0
  let lowCount = 0
  let mostUrgent: ApiCredentialAllowanceOverview["mostUrgent"]

  for (const profile of profiles) {
    const signal = getPrimaryAllowanceSignal(profile.telemetrySnapshot?.facts)
    if (!signal) continue

    monitoredCount += 1
    if (signal.level === API_CREDENTIAL_ALLOWANCE_LEVELS.Critical) {
      criticalCount += 1
    } else if (signal.level === API_CREDENTIAL_ALLOWANCE_LEVELS.Low) {
      lowCount += 1
    }

    if (signal.level === API_CREDENTIAL_ALLOWANCE_LEVELS.Unknown) continue

    if (
      !mostUrgent ||
      ALLOWANCE_LEVEL_RANK[signal.level] >
        ALLOWANCE_LEVEL_RANK[mostUrgent.signal.level] ||
      (ALLOWANCE_LEVEL_RANK[signal.level] ===
        ALLOWANCE_LEVEL_RANK[mostUrgent.signal.level] &&
        signal.urgency < mostUrgent.signal.urgency)
    ) {
      mostUrgent = {
        profileId: profile.id,
        profileName: profile.name,
        signal,
      }
    }
  }

  return {
    totalCount: profiles.length,
    monitoredCount,
    criticalCount,
    lowCount,
    ...(mostUrgent ? { mostUrgent } : {}),
  }
}
