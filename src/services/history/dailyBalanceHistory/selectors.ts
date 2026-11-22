import { CURRENCIES, DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import {
  projectAllowancePosition,
  type AccountAllowanceEntry,
} from "~/services/accounts/allowances"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import type { BalancePosition } from "~/services/amounts/balance"
import {
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { isCumulativeConsumption } from "~/services/amounts/usage"
import { listDayKeysInRange } from "~/services/history/dailyBalanceHistory/dayKeys"
import {
  compareFinancialHistorySnapshots,
  getAllowanceSeriesKey,
  getFinancialSeriesKey,
} from "~/services/history/dailyBalanceHistory/identity"
import {
  estimateNetInflow,
  getSoleAccountBalance,
  isConsumptionApplicableToBalance,
  NET_INFLOW_MAX_CLOCK_SKEW_MS,
  NET_INFLOW_STATUSES,
  type NetInflowResult,
} from "~/services/history/dailyBalanceHistory/netInflow"
import type { CurrencyType } from "~/types"
import type {
  DailyBalanceHistoryStore,
  DailyBalanceReferenceSnapshot,
} from "~/types/dailyBalanceHistory"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/utils/core/dayKey"

import type { DAILY_BALANCE_HISTORY_METRICS } from "./constants"

export const FINANCIAL_HISTORY_LIFECYCLE_STATUSES = {
  Ended: "ended",
  Expired: "expired",
  Reset: "reset",
} as const

export interface FinancialHistoryObservation {
  at: number
  observedAt?: number
  value: string | null
  status:
    | BalancePosition["amount"]["status"]
    | (typeof FINANCIAL_HISTORY_LIFECYCLE_STATUSES)[keyof typeof FINANCIAL_HISTORY_LIFECYCLE_STATUSES]
  netInflow?: NetInflowResult
  allowance?: AccountAllowanceEntry
}

export interface FinancialHistorySeries {
  key: string
  accountId: string
  position: BalancePosition
  allowance?: AccountAllowanceEntry
  values: Array<string | null>
  observations: FinancialHistoryObservation[]
}

/** Native amounts never pass through legacy quota conversion or today's exchange rate. */
export function buildFinancialHistorySeries(params: {
  store: DailyBalanceHistoryStore | null
  accountIds: string[]
  startDayKey: string
  endDayKey: string
  asOf: number
}) {
  const dayKeys = listDayKeysInRange(params)
  const byKey = new Map<string, FinancialHistorySeries>()
  const lastObservation = new Map<string, string>()
  const seenLifecycle = new Set<string>()
  const acceptanceOrder = new WeakMap<FinancialHistoryObservation, number>()
  const previousPositions = new Map<
    string,
    { position: BalancePosition; singleBalance: boolean }
  >()
  const periodBaselines = new Map<
    string,
    Map<number, { position: BalancePosition; singleBalance: boolean }>
  >()
  const states = new Map<
    string,
    Array<{
      at: number
      order: number
      position?: BalancePosition
      allowance?: AccountAllowanceEntry
    }>
  >()
  const resetAt = (
    position?: BalancePosition,
    allowance?: AccountAllowanceEntry,
  ) =>
    position?.window?.resetsAt ??
    (allowance && "resetsAt" in allowance.constraint.window
      ? allowance.constraint.window.resetsAt
      : undefined)
  const lifecycle: Array<{
    key: string
    observation: FinancialHistoryObservation
  }> = []
  const append = (
    series: FinancialHistorySeries,
    observation: FinancialHistoryObservation,
    order: number,
  ) => {
    const identity = JSON.stringify([
      series.key,
      observation.at,
      observation.observedAt,
      observation.value,
      observation.status,
    ])
    const isLifecycle =
      observation.status === FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Expired ||
      observation.status === FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Reset
    if (isLifecycle) {
      if (seenLifecycle.has(identity)) return
      seenLifecycle.add(identity)
    } else {
      if (lastObservation.get(series.key) === identity) return
      lastObservation.set(series.key, identity)
    }
    const dayIndex = dayKeys.indexOf(
      getDayKeyFromUnixSeconds(observation.at / 1000),
    )
    if (dayIndex < 0) return
    acceptanceOrder.set(observation, order)
    series.observations.push(observation)
  }
  for (const accountId of params.accountIds) {
    const snapshots = [
      ...(params.store?.financialSnapshotsByAccountId?.[accountId] ?? []),
    ].sort(compareFinancialHistorySnapshots)
    // A billing period can begin outside the viewer's local midnight. Its
    // first balance remains usable even when consumption was not yet available.
    const cumulativeBoundaries = new Set(
      snapshots.flatMap((snapshot) =>
        (snapshot.settledConsumption ?? [])
          .filter(
            (fact) =>
              "observedAt" in fact.amount &&
              fact.amount.observedAt <= params.asOf &&
              isCumulativeConsumption(fact),
          )
          .map((fact) => fact.window.start),
      ),
    )
    for (const [order, snapshot] of snapshots.entries()) {
      const singleBalance =
        getSoleAccountBalance(snapshot.balance?.positions ?? []) !== undefined
      const positions = [
        ...(snapshot.balance?.positions ?? []).map((position) => ({
          position,
          allowance: undefined as AccountAllowanceEntry | undefined,
          capturedAt: snapshot.balance!.capturedAt,
          seriesKey: getFinancialSeriesKey(position),
        })),
        ...(snapshot.allowances?.entries ?? []).map((allowance) => ({
          position: projectAllowancePosition(allowance),
          allowance,
          capturedAt: snapshot.allowances!.capturedAt,
          seriesKey: `allowance:${getAllowanceSeriesKey(allowance)}`,
        })),
      ]
      for (const { position, allowance, capturedAt, seriesKey } of positions) {
        if (
          capturedAt > params.asOf ||
          ("observedAt" in position.amount &&
            position.amount.observedAt > params.asOf) ||
          (allowance &&
            "observedAt" in allowance.constraint.stateObservation &&
            allowance.constraint.stateObservation.observedAt > params.asOf)
        )
          continue
        const key = JSON.stringify([accountId, seriesKey])
        const series = byKey.get(key) ?? {
          key,
          accountId,
          position,
          allowance,
          values: dayKeys.map(() => null),
          observations: [],
        }
        byKey.set(key, series)
        series.allowance = allowance
        const positionStates = states.get(key) ?? []
        positionStates.push({
          at: capturedAt,
          order,
          position,
          allowance,
        })
        states.set(key, positionStates)
        const amount = position.amount
        const state =
          allowance &&
          amount.status !== OBSERVATION_STATUSES.Known &&
          amount.status !== OBSERVATION_STATUSES.Stale &&
          allowance.constraint.limitState !== BUDGET_LIMIT_STATES.Finite
            ? allowance.constraint.stateObservation
            : amount
        const at =
          state.status === OBSERVATION_STATUSES.Known
            ? state.observedAt
            : capturedAt
        const observation: FinancialHistoryObservation = {
          at,
          observedAt: "observedAt" in state ? state.observedAt : undefined,
          value: isKnownOrStaleObservation(amount) ? amount.value : null,
          status: state.status,
          allowance,
        }
        const previous = previousPositions.get(key)
        const baselines = periodBaselines.get(key) ?? new Map()
        periodBaselines.set(key, baselines)
        if (
          !allowance &&
          amount.status === OBSERVATION_STATUSES.Known &&
          previous?.position.amount.status === OBSERVATION_STATUSES.Known &&
          previous.position.amount.observedAt < amount.observedAt
        ) {
          const consumption = (snapshot.settledConsumption ?? []).filter(
            ({ amount }) =>
              !("observedAt" in amount) || amount.observedAt <= params.asOf,
          )
          const starts = consumption
            .filter(
              (fact) =>
                isCumulativeConsumption(fact) &&
                isConsumptionApplicableToBalance(position, fact, singleBalance),
            )
            .flatMap((fact) => {
              const baseline = baselines.get(fact.window.start)
              return baseline ? [baseline] : []
            })
          for (const start of [...starts, previous]) {
            observation.netInflow = estimateNetInflow({
              start: start.position,
              end: position,
              consumption,
              allowAccountBalance: singleBalance && start.singleBalance,
            })
            if (observation.netInflow.status === NET_INFLOW_STATUSES.Available)
              break
          }
        }
        if (amount.status === OBSERVATION_STATUSES.Known) {
          for (const boundary of cumulativeBoundaries) {
            const baselineAmount = baselines.get(boundary)?.position.amount
            const distance = Math.abs(amount.observedAt - boundary)
            if (
              distance <= NET_INFLOW_MAX_CLOCK_SKEW_MS &&
              (baselineAmount?.status !== OBSERVATION_STATUSES.Known ||
                distance < Math.abs(baselineAmount.observedAt - boundary))
            ) {
              baselines.set(boundary, { position, singleBalance })
            }
          }
        } else {
          baselines.clear()
        }
        previousPositions.set(key, { position, singleBalance })
        append(series, observation, order)
        if (
          position.validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
          position.validity.at <= params.asOf
        ) {
          lifecycle.push({
            key,
            observation: {
              at: position.validity.at,
              value: null,
              status: FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Expired,
            },
          })
        }
        const reset = resetAt(position, allowance)
        if (reset !== undefined && reset <= params.asOf) {
          lifecycle.push({
            key,
            observation: {
              at: reset,
              value: null,
              status: FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Reset,
            },
          })
        }
      }
      const endings = [
        ...(snapshot.endedPositionKeys ?? []).map((key) => ({
          key,
          at: snapshot.balance!.capturedAt,
        })),
        ...(snapshot.endedAllowanceKeys ?? []).map((key) => ({
          key: `allowance:${key}`,
          at: snapshot.allowances!.capturedAt,
        })),
      ]
      for (const { key: endedKey, at } of endings) {
        if (at > params.asOf) continue
        const key = JSON.stringify([accountId, endedKey])
        previousPositions.delete(key)
        periodBaselines.delete(key)
        states.get(key)?.push({ at, order })
        const series = byKey.get(key)
        if (series)
          append(
            series,
            {
              at,
              value: null,
              status: FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Ended,
            },
            order,
          )
      }
    }
  }
  for (const { key, observation } of lifecycle) {
    const history = states.get(key) ?? []
    const effective =
      [...history].reverse().find((state) => state.at <= observation.at) ??
      history[0]
    const position = effective?.position
    const currentDeadline =
      observation.status === FINANCIAL_HISTORY_LIFECYCLE_STATUSES.Expired
        ? position?.validity.kind === BALANCE_VALIDITY_KINDS.Expires
          ? position.validity.at
          : undefined
        : resetAt(position, effective?.allowance)
    const series = byKey.get(key)
    if (series && currentDeadline === observation.at)
      append(series, observation, (effective?.order ?? 0) + 0.5)
  }
  for (const series of byKey.values()) {
    const finalState = [...(states.get(series.key) ?? [])]
      .reverse()
      .find(
        (state) =>
          state.position &&
          getDayKeyFromUnixSeconds(state.at / 1000) <= params.endDayKey,
      )
    if (finalState?.position) {
      series.position = finalState.position
      series.allowance = finalState.allowance
    }
    const compareAccepted = (
      a: FinancialHistoryObservation,
      b: FinancialHistoryObservation,
    ) => (acceptanceOrder.get(a) ?? 0) - (acceptanceOrder.get(b) ?? 0)
    // Daily states follow acceptance, even if the wall clock moved backwards.
    series.observations.sort(compareAccepted)
    for (const observation of series.observations) {
      const index = dayKeys.indexOf(
        getDayKeyFromUnixSeconds(observation.at / 1000),
      )
      // A failed refresh is still an observation, but supplies no new daily value.
      if (observation.status === OBSERVATION_STATUSES.Stale) continue
      series.values[index] = observation.value
    }
    series.observations.sort((a, b) => a.at - b.at || compareAccepted(a, b))
  }
  return {
    dayKeys,
    series: [...byKey.values()].filter(
      (series) => series.observations.length > 0,
    ),
  }
}

interface DailyBalanceHistoryCoverage {
  totalAccounts: number
  snapshotAccounts: number
  cashflowAccounts: number
  incomeAccounts: number
  outcomeAccounts: number
  estimatedIncomeAccounts: number
}

type ExchangeRateLookup = Record<string, number> | Map<string, number>

/**
 * Checks whether a nullable history metric is a trustworthy numeric value.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export type DailyBalanceHistoryMetric =
  (typeof DAILY_BALANCE_HISTORY_METRICS)[keyof typeof DAILY_BALANCE_HISTORY_METRICS]

interface PerAccountDailyBalanceMoneySeries {
  balance: Array<number | null>
  income: Array<number | null>
  estimatedIncome: Array<number | null>
  outcome: Array<number | null>
  net: Array<number | null>
}

interface AccountRangeSummary {
  accountId: string
  startBalance: number | null
  endBalance: number | null
  incomeTotal: number | null
  estimatedIncomeTotal: number | null
  outcomeTotal: number | null
  netTotal: number | null
  snapshotDays: number
  cashflowDays: number
  incomeDays: number
  outcomeDays: number
  estimatedIncomeDays: number
  totalDays: number
}

/**
 * Resolves the applicable exchange rate.
 */
function resolveExchangeRate(params: {
  accountId: string
  currencyType: CurrencyType
  exchangeRateByAccountId?: ExchangeRateLookup
}): number {
  const { accountId, currencyType, exchangeRateByAccountId } = params

  if (currencyType !== CURRENCIES.CNY) return 1

  let value: unknown
  if (exchangeRateByAccountId instanceof Map) {
    value = exchangeRateByAccountId.get(accountId)
  } else {
    value = exchangeRateByAccountId?.[accountId]
  }

  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_USD_TO_CNY_RATE
}

/** Preserve the archived estimate. The snapshot and usage periods can differ. */
function estimateReferenceInflow(
  perDay: Record<string, DailyBalanceReferenceSnapshot> | undefined,
  day: string,
): number | null {
  const today = perDay?.[day]
  const previousDay = subtractDaysFromDayKey(day, 1)
  const previous = perDay?.[previousDay]
  if (
    !today ||
    !previous ||
    today.consumptionUsd === null ||
    previous.capturedAt >= today.capturedAt
  )
    return null
  const estimated =
    today.balanceUsd - previous.balanceUsd + today.consumptionUsd
  return Number.isFinite(estimated) ? estimated : null
}

/**
 * Build per-account (non-aggregated) daily series, returning values in the requested currency.
 *
 * Missing snapshots are treated as per-account gaps and do not prevent other
 * accounts' series from rendering.
 */
export function buildPerAccountDailyBalanceMoneySeries(params: {
  store: DailyBalanceHistoryStore | null
  accountIds: string[]
  startDayKey: string
  endDayKey: string
  currencyType: CurrencyType
  exchangeRateByAccountId?: ExchangeRateLookup
  estimatedTodayIncomeEnabled?: boolean
  manualBalanceAccountIds?: Set<string>
}): {
  dayKeys: string[]
  seriesByAccountId: Record<string, PerAccountDailyBalanceMoneySeries>
  coverageByDay: DailyBalanceHistoryCoverage[]
} {
  const {
    store,
    accountIds,
    startDayKey,
    endDayKey,
    currencyType,
    exchangeRateByAccountId,
    estimatedTodayIncomeEnabled = false,
    manualBalanceAccountIds,
  } = params

  const dayKeys = listDayKeysInRange({ startDayKey, endDayKey })
  const totalAccounts = accountIds.length

  const coverageByDay: DailyBalanceHistoryCoverage[] = dayKeys.map(() => ({
    totalAccounts,
    snapshotAccounts: 0,
    cashflowAccounts: 0,
    incomeAccounts: 0,
    outcomeAccounts: 0,
    estimatedIncomeAccounts: 0,
  }))

  const seriesByAccountId: Record<string, PerAccountDailyBalanceMoneySeries> =
    {}

  if (totalAccounts === 0 || dayKeys.length === 0) {
    return { dayKeys, seriesByAccountId, coverageByDay }
  }

  for (const accountId of accountIds) {
    const exchangeRate = resolveExchangeRate({
      accountId,
      currencyType,
      exchangeRateByAccountId,
    })

    const balance = dayKeys.map(() => null) as Array<number | null>
    const income = dayKeys.map(() => null) as Array<number | null>
    const estimatedIncome = dayKeys.map(() => null) as Array<number | null>
    const outcome = dayKeys.map(() => null) as Array<number | null>
    const net = dayKeys.map(() => null) as Array<number | null>

    const perDay = store?.referenceSnapshotsByAccountId[accountId]
    if (perDay) {
      for (const [index, dayKey] of dayKeys.entries()) {
        const coverage = coverageByDay[index]
        const snapshot = perDay[dayKey]
        if (!coverage || !snapshot) continue

        coverage.snapshotAccounts += 1
        balance[index] = snapshot.balanceUsd * exchangeRate

        const reportedIncome = snapshot.incomeUsd
        const reportedOutcome = snapshot.consumptionUsd
        const hasIncome = isFiniteNumber(reportedIncome)
        const hasOutcome = isFiniteNumber(reportedOutcome)

        if (hasIncome) {
          coverage.incomeAccounts += 1
          income[index] = reportedIncome * exchangeRate
        }
        if (hasOutcome) {
          coverage.outcomeAccounts += 1
          outcome[index] = reportedOutcome * exchangeRate
        }
        if (hasIncome && hasOutcome) {
          coverage.cashflowAccounts += 1
          net[index] = (reportedIncome - reportedOutcome) * exchangeRate
        }
      }
    }

    if (
      estimatedTodayIncomeEnabled &&
      !manualBalanceAccountIds?.has(accountId)
    ) {
      for (const [index, dayKey] of dayKeys.entries()) {
        const estimate = estimateReferenceInflow(perDay, dayKey)
        const coverage = coverageByDay[index]
        if (estimate === null || !coverage) continue
        estimatedIncome[index] = estimate * exchangeRate
        coverage.estimatedIncomeAccounts += 1
      }
    }

    seriesByAccountId[accountId] = {
      balance,
      income,
      estimatedIncome,
      outcome,
      net,
    }
  }

  return { dayKeys, seriesByAccountId, coverageByDay }
}

/**
 * Build per-account summary values for a selected date range.
 *
 * This is intended for the Balance History overview KPIs and the unified per-account table.
 */
export function buildAccountRangeSummaries(params: {
  store: DailyBalanceHistoryStore | null
  accountIds: string[]
  startDayKey: string
  endDayKey: string
  currencyType: CurrencyType
  exchangeRateByAccountId?: ExchangeRateLookup
  estimatedTodayIncomeEnabled?: boolean
  manualBalanceAccountIds?: Set<string>
}): {
  dayKeys: string[]
  summaries: AccountRangeSummary[]
} {
  const {
    store,
    accountIds,
    startDayKey,
    endDayKey,
    currencyType,
    exchangeRateByAccountId,
    estimatedTodayIncomeEnabled = false,
    manualBalanceAccountIds,
  } = params

  const dayKeys = listDayKeysInRange({ startDayKey, endDayKey })
  const totalDays = dayKeys.length

  if (accountIds.length === 0 || totalDays === 0) {
    return { dayKeys, summaries: [] }
  }

  const summaries: AccountRangeSummary[] = []

  for (const accountId of accountIds) {
    const exchangeRate = resolveExchangeRate({
      accountId,
      currencyType,
      exchangeRateByAccountId,
    })

    const perDay = store?.referenceSnapshotsByAccountId[accountId]
    const startSnapshot = perDay?.[startDayKey]
    const endSnapshot = perDay?.[endDayKey]

    const startBalance =
      typeof startSnapshot?.balanceUsd === "number"
        ? startSnapshot.balanceUsd * exchangeRate
        : null

    const endBalance =
      typeof endSnapshot?.balanceUsd === "number"
        ? endSnapshot.balanceUsd * exchangeRate
        : null

    let snapshotDays = 0
    let cashflowDays = 0
    let incomeDays = 0
    let outcomeDays = 0
    let estimatedIncomeDays = 0
    let incomeSum = 0
    let estimatedIncomeSum = 0
    let outcomeSum = 0
    let netSum = 0

    for (const dayKey of dayKeys) {
      if (perDay) {
        const snapshot = perDay[dayKey]
        if (snapshot) {
          snapshotDays += 1

          const incomeValue = snapshot.incomeUsd
          const outcomeValue = snapshot.consumptionUsd
          const hasIncome = isFiniteNumber(incomeValue)
          const hasOutcome = isFiniteNumber(outcomeValue)

          if (hasIncome) {
            incomeDays += 1
            incomeSum += incomeValue * exchangeRate
          }
          if (hasOutcome) {
            outcomeDays += 1
            outcomeSum += outcomeValue * exchangeRate
          }
          if (hasIncome && hasOutcome) {
            cashflowDays += 1
            netSum += (incomeValue - outcomeValue) * exchangeRate
          }
        }
      }

      if (
        estimatedTodayIncomeEnabled &&
        !manualBalanceAccountIds?.has(accountId)
      ) {
        const estimate = estimateReferenceInflow(perDay, dayKey)
        if (estimate !== null) {
          estimatedIncomeDays += 1
          estimatedIncomeSum += estimate * exchangeRate
        }
      }
    }

    const incomeTotal = incomeDays > 0 ? incomeSum : null
    const estimatedIncomeTotal =
      estimatedIncomeDays > 0 ? estimatedIncomeSum : null
    const outcomeTotal = outcomeDays > 0 ? outcomeSum : null
    const netTotal = cashflowDays > 0 ? netSum : null

    summaries.push({
      accountId,
      startBalance,
      endBalance,
      incomeTotal,
      estimatedIncomeTotal,
      outcomeTotal,
      netTotal,
      snapshotDays,
      cashflowDays,
      incomeDays,
      outcomeDays,
      estimatedIncomeDays,
      totalDays,
    })
  }

  return { dayKeys, summaries }
}
