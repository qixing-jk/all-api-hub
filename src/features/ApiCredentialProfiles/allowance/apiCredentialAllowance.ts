import { CURRENCIES } from "~/constants/money"
import { usageScopeKey } from "~/services/amounts/balance"
import {
  BUDGET_LIMIT_STATES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { selectTelemetryBalances } from "~/services/apiCredentialProfiles/telemetry/facts"
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

import {
  API_CREDENTIAL_TELEMETRY_SOURCES,
  type ApiCredentialProfile,
  type ApiCredentialTelemetryAmount,
  type ApiCredentialTelemetryBalanceFact,
  type ApiCredentialTelemetryFacts,
  type ApiCredentialTelemetryQuotaWindowFact,
  type ApiCredentialTelemetryQuotaWindowType,
} from "~/types/apiCredentialProfiles"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

export const ALLOWANCE_COUNTDOWN_LABELS = {
  DaysHours: "daysHours",
  HoursMinutes: "hoursMinutes",
  Minutes: "minutes",
  Imminent: "imminent",
  Elapsed: "elapsed",
} as const

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
  remainingPercent?: number
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
  position?: ApiCredentialTelemetryBalanceFact["position"]
  budget?: ApiCredentialTelemetryBalanceFact["budget"]
}

export type ApiCredentialAllowanceSignal =
  ApiCredentialQuotaWindowAllowanceSignal | ApiCredentialBalanceAllowanceSignal

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
  if (
    left.kind === MEASUREMENT_UNIT_KINDS.Money &&
    right.kind === MEASUREMENT_UNIT_KINDS.Money
  ) {
    return left.currency === right.currency
  }
  if (
    left.kind === MEASUREMENT_UNIT_KINDS.Quota &&
    right.kind === MEASUREMENT_UNIT_KINDS.Quota
  ) {
    return left.code === right.code
  }
  if (
    left.kind === MEASUREMENT_UNIT_KINDS.Crypto &&
    right.kind === MEASUREMENT_UNIT_KINDS.Crypto
  )
    return left.id === right.id
  return false
}

/** Last-known percentages remain visible evidence but cannot establish current headroom. */
export function getQuotaWindowRemainingPercent(
  window: ApiCredentialTelemetryQuotaWindowFact,
): number | undefined {
  return window.status === OBSERVATION_STATUSES.Stale
    ? undefined
    : window.remainingPercent
}

/** Classifies a remaining quota percentage into an actionable level. */
export function getQuotaAllowanceLevel(
  remainingPercent: number | undefined,
): ApiCredentialAllowanceLevel {
  if (remainingPercent === undefined || !Number.isFinite(remainingPercent)) {
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
  if (
    !todayCost ||
    !Number.isFinite(Number(todayCost.value)) ||
    Number(todayCost.value) <= 0
  ) {
    return undefined
  }
  if (
    todayCost.status === OBSERVATION_STATUSES.Stale ||
    !balance.scope ||
    !todayCost.scope ||
    balance.status !== OBSERVATION_STATUSES.Known ||
    !Number.isFinite(balance.amount) ||
    usageScopeKey(balance.scope) !== usageScopeKey(todayCost.scope)
  )
    return undefined
  const matchingUnits = hasComparableUnits(balance.unit, todayCost.unit)
  const balanceSource = balance.position?.amount.source
  const customSource = API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint
  const legacyUsd =
    balance.position?.id === "legacy-balance" &&
    balanceSource?.kind === EVIDENCE_KINDS.Legacy &&
    todayCost.source?.kind === EVIDENCE_KINDS.Legacy &&
    todayCost.unit.kind === MEASUREMENT_UNIT_KINDS.Money &&
    todayCost.unit.currency === CURRENCIES.USD
  const now = Date.now()
  if (
    !todayCost.window &&
    todayCost.source?.adapter === customSource &&
    balanceSource?.adapter === customSource &&
    balanceSource.operation === todayCost.source.operation &&
    balance.observedAt !== undefined &&
    todayCost.observedAt === balance.observedAt &&
    balance.observedAt <= now &&
    getDayKeyFromUnixSeconds(balance.observedAt / 1000) ===
      getDayKeyFromUnixSeconds(now / 1000) &&
    (legacyUsd ||
      (matchingUnits &&
        balance.scope.keys.kind === SCOPE_SELECTION_KINDS.Restricted))
  )
    return Math.max(0, balance.amount / Number(todayCost.value))

  if (
    !matchingUnits ||
    todayCost.coverage !== FINANCIAL_COVERAGE.Complete ||
    !todayCost.window ||
    !todayCost.source ||
    todayCost.source.kind === EVIDENCE_KINDS.Legacy
  )
    return undefined
  if (
    [
      balance.scope.projects,
      balance.scope.keys,
      balance.scope.models,
      balance.scope.groups,
    ].some((selection) => selection.kind === SCOPE_SELECTION_KINDS.Unknown)
  )
    return undefined
  const duration = todayCost.window.end - todayCost.window.start
  if (
    duration < MILLISECONDS_PER_DAY ||
    !Number.isFinite(duration) ||
    todayCost.observedAt === undefined ||
    todayCost.window.end > todayCost.observedAt ||
    balance.observedAt === undefined ||
    balance.observedAt < todayCost.window.end
  )
    return undefined
  return Math.max(
    0,
    (balance.amount / Number(todayCost.value)) *
      (duration / MILLISECONDS_PER_DAY),
  )
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
    const remainingPercent = getQuotaWindowRemainingPercent(window)
    const level = getQuotaAllowanceLevel(remainingPercent)
    return {
      kind: "quota-window",
      id: `quota:${window.type}:${index}`,
      level,
      urgency:
        remainingPercent !== undefined && Number.isFinite(remainingPercent)
          ? remainingPercent / 100
          : Number.POSITIVE_INFINITY,
      windowType: window.type,
      unit: window.unit,
      remainingPercent,
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
    const budget = balance.budget
    const budgetPercent =
      budget?.limitState === BUDGET_LIMIT_STATES.Finite &&
      budget.stateObservation?.status !== OBSERVATION_STATUSES.Stale &&
      budget.limit.status === OBSERVATION_STATUSES.Known &&
      budget.remaining.status === OBSERVATION_STATUSES.Known &&
      Number(budget.limit.value) > 0
        ? (Number(budget.remaining.value) / Number(budget.limit.value)) * 100
        : undefined
    return {
      kind: "balance",
      id: `balance:${index}`,
      level: budget
        ? getQuotaAllowanceLevel(budgetPercent)
        : getBalanceAllowanceLevel(runwayDays),
      urgency:
        budgetPercent !== undefined
          ? budgetPercent / 100
          : runwayDays === undefined
            ? Number.POSITIVE_INFINITY
            : runwayDays /
              API_CREDENTIAL_ALLOWANCE_THRESHOLDS.balanceComfortableRunwayDays,
      amount: balance.amount,
      unit: balance.unit,
      semantics: balance.semantics,
      ...(balance.position ? { position: balance.position } : {}),
      ...(balance.budget ? { budget: balance.budget } : {}),
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
      selectTelemetryBalances(facts),
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
  (typeof ALLOWANCE_COUNTDOWN_LABELS)[keyof typeof ALLOWANCE_COUNTDOWN_LABELS]

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
  if (countdown.isElapsed)
    return { key: ALLOWANCE_COUNTDOWN_LABELS.Elapsed, values: {} }
  if (countdown.days >= 1) {
    return {
      key: ALLOWANCE_COUNTDOWN_LABELS.DaysHours,
      values: { days: countdown.days, hours: countdown.hours },
    }
  }
  if (countdown.hours >= 1) {
    return {
      key: ALLOWANCE_COUNTDOWN_LABELS.HoursMinutes,
      values: { hours: countdown.hours, minutes: countdown.minutes },
    }
  }
  if (countdown.minutes >= 1) {
    return {
      key: ALLOWANCE_COUNTDOWN_LABELS.Minutes,
      values: { minutes: countdown.minutes },
    }
  }
  return { key: ALLOWANCE_COUNTDOWN_LABELS.Imminent, values: {} }
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
