import { assetIdentity } from "~/services/amounts/assets"
import { usageScopeKey, type UsageScope } from "~/services/amounts/balance"
import { subtractDecimal, sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  isCumulativeIncome,
  type FinancialIncomeFact,
} from "~/services/amounts/income"
import {
  isCumulativeConsumption,
  type FinancialConsumptionFact,
} from "~/services/amounts/usage"
import { FINANCIAL_HISTORY_ACTIVITY_KINDS } from "~/services/history/dailyBalanceHistory/constants"
import type {
  DailyBalanceHistoryStore,
  ReportedDayCost,
} from "~/types/dailyBalanceHistory"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

import { listDayKeysInRange } from "./dayKeys"
import { NET_INFLOW_MAX_CLOCK_SKEW_MS } from "./netInflow"

type RecordedActivityKind = (typeof FINANCIAL_HISTORY_ACTIVITY_KINDS)[
  "Income" | "Consumption"]
export type FinancialHistoryActivityKind =
  RecordedActivityKind | typeof FINANCIAL_HISTORY_ACTIVITY_KINDS.Net

type ActivityFact = FinancialIncomeFact | FinancialConsumptionFact
type Candidate = {
  fact: ActivityFact
  value: string
  observedAt: number
  end: number
  stream: string
  firstDay: string
  lastDay: string
  captureIndex: number
  partial?: boolean
}

/** Preserve the distinction between an unavailable subtotal and a recorded zero. */
function sumRecorded(values: string[]): string | null {
  if (!values.length) return null
  try {
    return sumDecimals(values)
  } catch {
    return null
  }
}

/** Retain the widest query from repeated cumulative observations of the same stream. */
function nonOverlappingFacts(candidates: Candidate[]): Candidate[] {
  const cumulative = new Map<string, Candidate>()
  const intervals = candidates.filter((candidate) => {
    const { fact, stream } = candidate
    const repeated =
      "settlement" in fact
        ? isCumulativeConsumption(fact)
        : isCumulativeIncome(fact)
    if (!repeated) return true
    const key = JSON.stringify([stream, fact.window.start, fact.window.end])
    const prior = cumulative.get(key)
    if (
      !prior ||
      (fact.coverage === prior.fact.coverage &&
        candidate.observedAt > prior.observedAt) ||
      (fact.coverage === FINANCIAL_COVERAGE.Complete &&
        prior.fact.coverage !== fact.coverage)
    ) {
      cumulative.set(key, candidate)
    }
    return false
  })
  const sorted = [...intervals, ...cumulative.values()].sort(
    (a, b) =>
      a.fact.window.start - b.fact.window.start ||
      b.end - a.end ||
      b.observedAt - a.observedAt,
  )
  const selected: Candidate[] = []
  let conflictingUntil = -Infinity
  for (const candidate of sorted) {
    const window = candidate.fact.window
    if (window.start < conflictingUntil) {
      conflictingUntil = Math.max(conflictingUntil, candidate.end)
      continue
    }
    const previous = selected.at(-1)
    if (previous && window.start < previous.end) {
      if (
        window.start === previous.fact.window.start &&
        candidate.stream === previous.stream &&
        (candidate.end !== previous.end ||
          candidate.observedAt !== previous.observedAt ||
          candidate.value === previous.value)
      )
        continue
      // An overlapping billing window cannot be split without knowing its individual events.
      selected.pop()
      conflictingUntil = Math.max(previous.end, candidate.end)
      continue
    }
    selected.push(candidate)
  }
  return selected
}

/** A recorded net amount requires two complete observations of the same interval. */
function netCashflow(income: Candidate[], spending: Candidate[]): Candidate[] {
  const comparableKey = ({ fact }: Candidate) =>
    JSON.stringify([
      usageScopeKey(fact.scope),
      fact.window.start,
      fact.window.end,
      fact.window.timeZone,
    ])
  const spendingByWindow = new Map(
    spending
      .filter(({ fact }) => fact.coverage === FINANCIAL_COVERAGE.Complete)
      .map((candidate) => [comparableKey(candidate), candidate] as const),
  )
  return income.flatMap((credit) => {
    if (credit.fact.coverage !== FINANCIAL_COVERAGE.Complete) return []
    const charge = spendingByWindow.get(comparableKey(credit))
    if (
      !charge ||
      credit.lastDay !== charge.lastDay ||
      (credit.end !== charge.end &&
        (credit.captureIndex !== charge.captureIndex ||
          Math.abs(credit.end - charge.end) > NET_INFLOW_MAX_CLOCK_SKEW_MS))
    )
      return []
    try {
      return [
        {
          ...credit,
          value: subtractDecimal(credit.value, charge.value),
          partial: credit.end !== charge.end,
        },
      ]
    } catch {
      return []
    }
  })
}

/** Project accepted native cashflow without filling missing intervals or converting assets. */
export function buildFinancialHistoryActivity({
  store,
  accountIds,
  dayKeys,
  asOf,
}: {
  store: DailyBalanceHistoryStore | null
  accountIds: string[]
  dayKeys: string[]
  asOf: number
}) {
  const days = new Set(dayKeys)
  const dateKeyCache = new Map<string, string>()
  const dayAt = (time: number, zone: string) => {
    const key = JSON.stringify([time, zone])
    const cached = dateKeyCache.get(key)
    if (cached) return cached
    const day = getDayKeyFromUnixSeconds(time / 1000, zone)
    dateKeyCache.set(key, day)
    return day
  }

  return accountIds.flatMap((accountId) => {
    const grouped = new Map<
      string,
      { kind: FinancialHistoryActivityKind; candidates: Candidate[] }
    >()
    const dayCosts = new Map<string, Map<string, ReportedDayCost>>()
    const append = (
      kind: RecordedActivityKind,
      fact: ActivityFact,
      captureIndex: number,
    ) => {
      const { amount, asset, window } = fact
      if (
        asset.kind === ASSET_KINDS.Unknown ||
        amount.status !== OBSERVATION_STATUSES.Known ||
        (amount.source.kind !== EVIDENCE_KINDS.Reported &&
          amount.source.kind !== EVIDENCE_KINDS.Derived) ||
        amount.observedAt > asOf ||
        fact.coverage === FINANCIAL_COVERAGE.Unknown
      )
        return
      const end = Math.min(window.end, amount.observedAt)
      if (end <= window.start) return
      const firstDay = dayAt(window.start, window.timeZone)
      const lastDay = dayAt(end - 1, window.timeZone)
      if (!days.has(firstDay) || !days.has(lastDay)) return

      const key = JSON.stringify([kind, assetIdentity(asset)])
      const group = grouped.get(key) ?? { kind, candidates: [] }
      group.candidates.push({
        fact,
        value: amount.value,
        observedAt: amount.observedAt,
        end,
        firstDay,
        lastDay,
        captureIndex,
        stream: JSON.stringify([
          usageScopeKey(fact.scope),
          window.timeZone,
          amount.source.adapter,
          kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Consumption &&
          "settlement" in fact &&
          isCumulativeConsumption(fact) &&
          (amount.source.operation === "/api/log/self/stat:quota" ||
            amount.source.operation === "/api/log/self:consumption")
            ? "/api/log/self:daily-quota"
            : amount.source.operation,
          amount.source.contractVersion,
          amount.source.kind,
          "classification" in fact ? fact.classification : undefined,
        ]),
      })
      grouped.set(key, group)
    }
    const snapshots = store?.financialSnapshotsByAccountId?.[accountId] ?? []
    for (const [index, snapshot] of snapshots.entries()) {
      for (const fact of snapshot.reportedIncome ?? [])
        append(FINANCIAL_HISTORY_ACTIVITY_KINDS.Income, fact, index)
      for (const fact of snapshot.settledConsumption ?? [])
        if (fact.settlement === FINANCIAL_SETTLEMENT_STATUSES.Settled)
          append(FINANCIAL_HISTORY_ACTIVITY_KINDS.Consumption, fact, index)
      for (const fact of snapshot.reportedDayCosts ?? []) {
        if (
          fact.asset.kind === ASSET_KINDS.Unknown ||
          fact.amount.status !== OBSERVATION_STATUSES.Known ||
          fact.amount.observedAt > asOf
        )
          continue
        const day =
          fact.dayKey ?? getDayKeyFromUnixSeconds(fact.amount.observedAt / 1000)
        if (!days.has(day)) continue
        const { adapter, operation, contractVersion } = fact.amount.source
        const key = JSON.stringify([
          "site-day",
          assetIdentity(fact.asset),
          usageScopeKey(fact.scope, true),
          adapter,
          operation,
          contractVersion,
          Boolean(fact.dayKey),
        ])
        const values = dayCosts.get(key) ?? new Map<string, ReportedDayCost>()
        const prior = (
          fact.dayKey ? values.get(day) : values.values().next().value
        )?.amount
        if (
          prior?.status !== OBSERVATION_STATUSES.Known ||
          prior.observedAt <= fact.amount.observedAt
        ) {
          // An observation date does not establish a new site billing day.
          if (!fact.dayKey) values.clear()
          values.set(day, fact)
        }
        dayCosts.set(key, values)
      }
    }
    for (const group of grouped.values()) {
      group.candidates = nonOverlappingFacts(group.candidates)
    }
    for (const { kind, candidates } of [...grouped.values()]) {
      const asset = candidates[0]?.fact.asset
      if (kind !== FINANCIAL_HISTORY_ACTIVITY_KINDS.Income || !asset) continue
      const assetKey = assetIdentity(asset)
      const spending = grouped.get(
        JSON.stringify([
          FINANCIAL_HISTORY_ACTIVITY_KINDS.Consumption,
          assetKey,
        ]),
      )
      const net = netCashflow(candidates, spending?.candidates ?? [])
      if (net.length)
        grouped.set(
          JSON.stringify([FINANCIAL_HISTORY_ACTIVITY_KINDS.Net, assetKey]),
          {
            kind: FINANCIAL_HISTORY_ACTIVITY_KINDS.Net,
            candidates: net,
          },
        )
    }
    const recorded = Array.from(
      grouped,
      ([key, { kind, candidates: selected }]) => {
        const first = selected[0]
        const total = sumRecorded(selected.map(({ value }) => value))
        if (!first || total === null) return []
        const dayValues = new Map<string, string[]>()
        const recordedDays = new Set<string>()
        for (const { firstDay, lastDay, value } of selected) {
          for (const day of listDayKeysInRange({
            startDayKey: firstDay,
            endDayKey: lastDay,
          }))
            recordedDays.add(day)
          if (firstDay !== lastDay) continue
          const values = dayValues.get(firstDay) ?? []
          values.push(value)
          dayValues.set(firstDay, values)
        }
        return [
          {
            key,
            kind,
            accountId,
            asset: first.fact.asset,
            total,
            partial: selected.some(
              ({ fact, partial }) =>
                partial || fact.coverage === FINANCIAL_COVERAGE.Partial,
            ),
            recordedDays: [...recordedDays],
            values: dayKeys.map((day) => sumRecorded(dayValues.get(day) ?? [])),
            scopes: [
              ...new Map(
                selected.map(
                  ({ fact }) =>
                    [usageScopeKey(fact.scope), fact.scope] as const,
                ),
              ).values(),
            ] as UsageScope[],
          },
        ]
      },
    ).flat()
    const siteDays = Array.from(dayCosts, ([key, costs]) => {
      const first = costs.values().next().value
      if (!first) return []
      const valueFor = (fact?: ReportedDayCost) =>
        fact?.amount.status === OBSERVATION_STATUSES.Known
          ? fact.amount.value
          : null
      const values = dayKeys.map((day) => valueFor(costs.get(day)))
      const total = sumRecorded(
        values.flatMap((value) => (value === null ? [] : [value])),
      )
      return total === null
        ? []
        : [
            {
              key,
              kind: FINANCIAL_HISTORY_ACTIVITY_KINDS.Consumption,
              siteDay: true as const,
              ...(!first.dayKey ? { latestReading: true as const } : {}),
              partial: true,
              accountId,
              asset: first.asset,
              total,
              recordedDays: [...costs.keys()],
              values,
              scopes: [first.scope],
            },
          ]
    }).flat()
    return [...recorded, ...siteDays]
  })
}
