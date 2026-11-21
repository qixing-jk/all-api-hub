import { CURRENCIES, isSupportedCurrency } from "~/constants/money"
import { assetIdentity } from "~/services/amounts/assets"
import {
  isKnownOrStaleObservation,
  usageScopeKey,
  type Amount,
} from "~/services/amounts/balance"
import { parseDecimal, sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ACCOUNT_EXCLUSION_REASONS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { financialIncomeFactSchema } from "~/services/amounts/income"
import {
  financialConsumptionFactSchema,
  type FinancialConsumptionFact,
} from "~/services/amounts/usage"
import type {
  AccountMetricCoverage,
  CurrencyAmount,
  CurrencyType,
  DisplaySiteData,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  type AccountTodayMetricReason,
} from "~/types/accountTodayStats"
import {
  convertCnyToUsd,
  convertCurrencyAmount,
  convertUsdToCny,
} from "~/utils/core/money"

type PeriodExclusionReason =
  | AccountTodayMetricReason
  | (typeof FINANCIAL_ACCOUNT_EXCLUSION_REASONS)[
      "Disabled" | "Settings" | "NoUsableData" | "Duplicate" | "Conflict"]

type ConsumptionAccount = Pick<
  DisplaySiteData,
  "id" | "disabled" | "settledConsumption"
> &
  Partial<
    Pick<
      DisplaySiteData,
      "todayStatsAvailability" | "exchangeRate" | "referenceConsumption"
    >
  >
type ConsumptionGroup = {
  amount: Amount
  cnyValue?: string
  usdValue?: string
  window: FinancialConsumptionFact["window"]
  coverage: AccountMetricCoverage
}

/** Prefer the configured conversion for display while retaining the original amount. */
export function displayCashflowAmount(
  group: Pick<ConsumptionGroup, "amount" | "cnyValue" | "usdValue">,
  currencyType?: CurrencyType,
): Amount {
  return currencyType === CURRENCIES.CNY && group.cnyValue !== undefined
    ? {
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        value: group.cnyValue,
      }
    : currencyType === CURRENCIES.USD && group.usdValue !== undefined
      ? {
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          value: group.usdValue,
        }
      : group.amount
}

/** Each currency has independent coverage; native intervals never become an exchange rate. */
export interface ConsumptionProjection {
  /** Release values remain readable without becoming native period facts. */
  references?: (ReferenceCashflow & { accountId: string })[]
  amount: CurrencyAmount
  coverage: AccountMetricCoverage
  coverageByCurrency: Record<CurrencyType, AccountMetricCoverage>
  groups: ConsumptionGroup[]
  nativeCoverage: AccountMetricCoverage
  excludedAccounts: { accountId: string; reason: PeriodExclusionReason }[]
}

/** Complete monetary populations share one converted display total; native facts stay intact. */
export function selectDisplayCashflowGroups(
  projection: Pick<ConsumptionProjection, "groups" | "nativeCoverage">,
  currency?: CurrencyType,
): ConsumptionProjection["groups"] {
  const { groups, nativeCoverage } = projection
  const first = groups[0]
  if (
    !currency ||
    !first ||
    groups.length < 2 ||
    nativeCoverage.status !== ACCOUNT_TODAY_METRIC_STATUSES.Complete ||
    nativeCoverage.completeCount === 0 ||
    nativeCoverage.completeCount !== nativeCoverage.eligibleCount ||
    nativeCoverage.partialCount !== 0 ||
    nativeCoverage.legacyUnclassifiedCount !== 0 ||
    groups.some(
      (group) =>
        group.amount.asset.kind !== ASSET_KINDS.Currency ||
        !isSupportedCurrency(group.amount.asset.code) ||
        group.coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable ||
        group.coverage.completeCount === 0 ||
        group.coverage.partialCount !== 0 ||
        group.coverage.legacyUnclassifiedCount !== 0 ||
        group.window.start !== first.window.start ||
        group.window.end !== first.window.end ||
        group.window.timeZone !== first.window.timeZone,
    )
  )
    return groups
  // The projection already converted each contribution at its own account rate.
  const amounts = groups.map((group) => displayCashflowAmount(group, currency))
  if (
    amounts.some(
      ({ asset }) =>
        asset.kind !== ASSET_KINDS.Currency || asset.code !== currency,
    )
  )
    return groups
  try {
    return [
      {
        amount: {
          asset: { kind: ASSET_KINDS.Currency, code: currency },
          value: sumDecimals(amounts.map(({ value }) => value)),
        },
        window: first.window,
        coverage: nativeCoverage,
      },
    ]
  } catch {
    return groups
  }
}

interface DisplayCashflowSelection {
  value: number
  currency: CurrencyType
  coverage: AccountMetricCoverage
  displayAmount?: Amount
  nativeAmount?: Amount
  /** Account comparisons use an exact CNY subtotal instead of a rounded USD quotient. */
  comparisonAmount?: Amount
}

/** Selects the same native amount and configured currency shown on an account row. */
export function selectDisplayCashflow(
  projection: ConsumptionProjection,
  currency?: CurrencyType,
  exchangeRate?: number,
): DisplayCashflowSelection {
  if (currency === undefined) {
    const group = projection.groups[0]
    if (group)
      return {
        value: Number(group.amount.value),
        currency:
          group.amount.asset.kind === ASSET_KINDS.Currency &&
          group.amount.asset.code === CURRENCIES.CNY
            ? CURRENCIES.CNY
            : CURRENCIES.USD,
        coverage: group.coverage,
        displayAmount: group.amount,
        nativeAmount: group.amount,
      }
    return {
      value: 0,
      currency: CURRENCIES.USD,
      coverage: projection.coverage,
      displayAmount: undefined,
      nativeAmount: undefined,
    }
  }
  const monetaryGroups = projection.groups.filter(
    ({ amount }) =>
      amount.asset.kind === ASSET_KINDS.Currency &&
      (amount.asset.code === CURRENCIES.USD ||
        amount.asset.code === CURRENCIES.CNY),
  )
  if (
    monetaryGroups.length > 1 &&
    new Set(monetaryGroups.map(({ window }) => JSON.stringify(window))).size ===
      1
  ) {
    const converted = monetaryGroups.map((group) =>
      convertCurrencyAmount(
        displayCashflowAmount(group, currency),
        currency,
        exchangeRate,
      ),
    )
    if (
      converted.every(
        ({ asset }) =>
          asset.kind === ASSET_KINDS.Currency && asset.code === currency,
      )
    ) {
      try {
        const displayAmount: Amount = {
          asset: { kind: ASSET_KINDS.Currency, code: currency },
          value: sumDecimals(converted.map(({ value }) => value)),
        }
        const cnyAmounts = monetaryGroups.map((group) =>
          convertCurrencyAmount(
            displayCashflowAmount(group, CURRENCIES.CNY),
            CURRENCIES.CNY,
            exchangeRate,
          ),
        )
        const comparisonAmount: Amount | undefined = cnyAmounts.every(
          ({ asset }) =>
            asset.kind === ASSET_KINDS.Currency &&
            asset.code === CURRENCIES.CNY,
        )
          ? {
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
              value: sumDecimals(cnyAmounts.map(({ value }) => value)),
            }
          : undefined
        return {
          value: Number(displayAmount.value),
          currency,
          coverage: projection.nativeCoverage,
          displayAmount,
          nativeAmount: undefined,
          comparisonAmount,
        }
      } catch {
        // Independent native groups remain readable when their converted total exceeds the decimal bounds.
      }
    }
  }
  const coverage = projection.coverageByCurrency[currency]
  if (coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable) {
    const original =
      currency === CURRENCIES.CNY ? CURRENCIES.USD : CURRENCIES.CNY
    for (const nativeCurrency of [currency, original] as const) {
      const groups = projection.groups.filter(
        ({ amount }) =>
          amount.asset.kind === ASSET_KINDS.Currency &&
          amount.asset.code === nativeCurrency,
      )
      if (groups.length === 1) {
        const group = groups[0]!
        const amount = convertCurrencyAmount(
          displayCashflowAmount(group, currency),
          currency,
          exchangeRate,
        )
        return {
          // This approximation controls only the row's presentation and color.
          // The native amount is formatted directly; projection arithmetic stays unchanged.
          value: Number(amount.value),
          currency:
            amount.asset.kind === ASSET_KINDS.Currency &&
            amount.asset.code === CURRENCIES.CNY
              ? CURRENCIES.CNY
              : CURRENCIES.USD,
          coverage: group.coverage,
          displayAmount: amount,
          nativeAmount: group.amount,
        } as const
      }
    }
    if (projection.groups.length === 1) {
      const group = projection.groups[0]!
      return {
        value: Number(group.amount.value),
        currency,
        coverage: group.coverage,
        displayAmount: group.amount,
        nativeAmount: group.amount,
      }
    }
  }
  return {
    value: projection.amount[currency],
    currency,
    coverage,
    displayAmount: undefined,
    nativeAmount:
      coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
        ? undefined
        : ({
            asset: { kind: ASSET_KINDS.Currency, code: currency },
            value: String(projection.amount[currency]),
          } satisfies Amount),
  }
}

export interface ReferenceCashflow {
  amount: CurrencyAmount
  observedAt?: number
  lastKnown: boolean
}

/** An unavailable native reading cannot replace a saved release amount. */
export function hasRecordedCashflowAmount(
  observations: readonly Pick<FinancialConsumptionFact, "amount">[] | undefined,
): boolean {
  return (
    observations?.some(({ amount }) => isKnownOrStaleObservation(amount)) ??
    false
  )
}

/** Today-only release references are displayed separately from qualified native totals. */
export function getReferenceCashflowTotal(
  projection: Pick<ConsumptionProjection, "references">,
  currencyType: CurrencyType,
): Amount | undefined {
  const values = (projection.references ?? []).flatMap((reference) =>
    reference.lastKnown ? [] : [String(reference.amount[currencyType])],
  )
  return values.length
    ? {
        asset: { kind: ASSET_KINDS.Currency, code: currencyType },
        value: sumDecimals(values),
      }
    : undefined
}

/** Existing scalar consumers receive only a matching local-day interval in their native currency. */
export function getDisplayConsumptionProjection(
  accounts: readonly ConsumptionAccount[],
  asOf = Date.now(),
): ConsumptionProjection {
  const projection = projectPeriodAmounts(
    accounts.map((account) => ({
      id: account.id,
      disabled: account.disabled,
      exchangeRate: account.exchangeRate,
      observations: account.settledConsumption,
      availabilityReason: account.todayStatsAvailability?.consumption.reason,
      pendingRefresh:
        !account.settledConsumption?.length &&
        account.todayStatsAvailability?.consumption.reason ===
          ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
    })),
    asOf,
    (value) => {
      const parsed = financialConsumptionFactSchema.safeParse(value)
      return parsed.success &&
        parsed.data.settlement === FINANCIAL_SETTLEMENT_STATUSES.Settled
        ? parsed.data
        : undefined
    },
  )
  const references = accounts.flatMap((account) =>
    !account.disabled &&
    !hasRecordedCashflowAmount(account.settledConsumption) &&
    account.referenceConsumption
      ? [{ ...account.referenceConsumption, accountId: account.id }]
      : [],
  )
  return { ...projection, ...(references.length ? { references } : {}) }
}

/** Reported credits use their own facts; they are never inferred from balance changes or use. */
export function getDisplayIncomeProjection(
  accounts: readonly (Pick<
    DisplaySiteData,
    "id" | "disabled" | "excludeFromTodayIncome" | "reportedIncome"
  > &
    Partial<
      Pick<
        DisplaySiteData,
        "todayStatsAvailability" | "exchangeRate" | "referenceIncome"
      >
    >)[],
  asOf = Date.now(),
): ConsumptionProjection {
  const projection = projectPeriodAmounts(
    accounts.map((account) => ({
      id: account.id,
      disabled: account.disabled,
      exchangeRate: account.exchangeRate,
      excludedBySettings: account.excludeFromTodayIncome,
      observations: account.reportedIncome,
      availabilityReason: account.todayStatsAvailability?.income.reason,
      pendingRefresh:
        !account.reportedIncome?.length &&
        account.todayStatsAvailability?.income.reason ===
          ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
    })),
    asOf,
    (value) => {
      const parsed = financialIncomeFactSchema.safeParse(value)
      return parsed.success ? parsed.data : undefined
    },
  )
  const references = accounts.flatMap((account) =>
    !account.disabled &&
    !account.excludeFromTodayIncome &&
    !hasRecordedCashflowAmount(account.reportedIncome) &&
    account.referenceIncome
      ? [{ ...account.referenceIncome, accountId: account.id }]
      : [],
  )
  return { ...projection, ...(references.length ? { references } : {}) }
}

/** Native period arithmetic is shared, while each caller validates its own domain facts. */
function projectPeriodAmounts(
  accounts: readonly {
    id: string
    disabled?: boolean
    exchangeRate?: number
    excludedBySettings?: boolean
    observations?: unknown[]
    availabilityReason?: AccountTodayMetricReason
    pendingRefresh?: boolean
  }[],
  asOf: number,
  parse: (
    value: unknown,
  ) => Omit<FinancialConsumptionFact, "settlement"> | undefined,
): ConsumptionProjection {
  const enabled = accounts.filter(
    (account) => !account.disabled && !account.excludedBySettings,
  )
  const rates = new Map(
    enabled.map(({ id, exchangeRate }) => [id, exchangeRate]),
  )
  const legacyUnclassifiedCount = enabled.filter(
    (account) => account.pendingRefresh,
  ).length
  const localStart = new Date(asOf)
  localStart.setHours(0, 0, 0, 0)
  const localEnd = new Date(localStart)
  localEnd.setDate(localEnd.getDate() + 1)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const incomplete = new Set<string>()
  const excluded = new Map<string, PeriodExclusionReason>()
  const candidates = enabled.flatMap((account) =>
    (account.observations ?? []).flatMap((value) => {
      const fact = parse(value)
      if (!fact) {
        incomplete.add(account.id)
        return []
      }
      const unrestricted = [
        fact.scope.projects,
        fact.scope.keys,
        fact.scope.models,
        fact.scope.groups,
        ...(fact.scope.routes ? [fact.scope.routes] : []),
      ].every((selection) => selection.kind === SCOPE_SELECTION_KINDS.All)
      const withinToday =
        fact.window.start >= localStart.getTime() &&
        fact.window.end <= localEnd.getTime()
      const followsLocalDay =
        fact.window.start === localStart.getTime() &&
        fact.window.timeZone === timeZone
      const available =
        fact.amount.status === OBSERVATION_STATUSES.Known &&
        fact.asset.kind !== ASSET_KINDS.Unknown &&
        unrestricted &&
        fact.scope.subject.kind === FINANCIAL_SUBJECT_KINDS.Account &&
        (!fact.scope.subject.accountId ||
          fact.scope.subject.accountId === account.id) &&
        fact.amount.source.kind !== EVIDENCE_KINDS.Legacy &&
        fact.amount.source.kind !== EVIDENCE_KINDS.Manual &&
        fact.coverage !== FINANCIAL_COVERAGE.Unknown &&
        withinToday
      if (!available || fact.amount.status !== OBSERVATION_STATUSES.Known) {
        incomplete.add(`${account.id}:${assetIdentity(fact.asset)}`)
        if (!withinToday)
          excluded.set(account.id, ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod)
        return []
      }
      if (!followsLocalDay)
        incomplete.add(`${account.id}:${assetIdentity(fact.asset)}`)
      return [{ id: account.id, fact, value: fact.amount.value }]
    }),
  )
  const groups: ConsumptionGroup[] = []
  const amount = { USD: 0, CNY: 0 }
  const nativeComplete = new Set<string>()
  const nativeIncluded = new Set<string>()
  const assets = new Set(
    candidates.map(({ fact }) => assetIdentity(fact.asset)),
  )
  const emptyCoverage = (): AccountMetricCoverage => ({
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    completeCount: 0,
    partialCount: 0,
    eligibleCount: enabled.length,
    legacyUnclassifiedCount,
  })
  const coverageByCurrency: Record<CurrencyType, AccountMetricCoverage> = {
    USD: emptyCoverage(),
    CNY: emptyCoverage(),
  }
  for (const asset of assets) {
    const matching = candidates.filter(
      ({ fact }) => assetIdentity(fact.asset) === asset,
    )
    // Local account IDs cannot establish distinct upstream wallets at one authority.
    for (const candidate of matching) {
      const scope = candidate.fact.scope
      if (
        !scope.walletId &&
        !scope.organizationId &&
        !scope.workspaceId &&
        matching.some(
          (other) =>
            other.id !== candidate.id &&
            other.fact.scope.authority === scope.authority,
        )
      )
        incomplete.add(`${candidate.id}:${asset}`)
    }
    const seen = new Map<string, (typeof matching)[number]>()
    const conflicts = new Set<string>()
    const members = new Map<string, Set<string>>()
    for (const candidate of matching) {
      const { fact } = candidate
      const key = JSON.stringify([
        usageScopeKey(
          fact.scope,
          !(
            fact.scope.walletId ||
            fact.scope.organizationId ||
            fact.scope.workspaceId
          ),
        ),
        fact.window,
      ])
      const previous = seen.get(key)
      const ids = members.get(key) ?? new Set<string>()
      ids.add(candidate.id)
      members.set(key, ids)
      if (!previous) seen.set(key, candidate)
      else if (
        previous.value !== candidate.value ||
        JSON.stringify(previous.fact.amount.source) !==
          JSON.stringify(fact.amount.source)
      )
        conflicts.add(key)
      else if (previous.id !== candidate.id)
        excluded.set(
          candidate.id,
          FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Duplicate,
        )
    }
    for (const key of conflicts)
      for (const id of members.get(key) ?? []) {
        incomplete.add(`${id}:${asset}`)
        excluded.set(id, FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Conflict)
      }
    const facts = [...seen].flatMap(([key, value]) =>
      conflicts.has(key) ? [] : [value],
    )
    const windows = new Set(
      facts.map(({ fact }) => JSON.stringify(fact.window)),
    )
    for (const window of windows) {
      const compatible = facts.filter(
        ({ fact }) => JSON.stringify(fact.window) === window,
      )
      const completeIds = new Set(
        compatible
          .filter(
            ({ id, fact }) =>
              fact.coverage === FINANCIAL_COVERAGE.Complete &&
              !incomplete.has(id) &&
              !incomplete.has(`${id}:${asset}`) &&
              !facts.some(
                (other) =>
                  other.id === id &&
                  JSON.stringify(other.fact.window) !== window,
              ) &&
              !compatible.some(
                (other) =>
                  other.id === id &&
                  other.fact.coverage !== FINANCIAL_COVERAGE.Complete,
              ),
          )
          .map(({ id }) => id),
      )
      const partialIds = new Set(
        compatible.filter(({ id }) => !completeIds.has(id)).map(({ id }) => id),
      )
      const coverage: AccountMetricCoverage = {
        status:
          completeIds.size === enabled.length && enabled.length > 0
            ? ACCOUNT_TODAY_METRIC_STATUSES.Complete
            : completeIds.size + partialIds.size > 0
              ? ACCOUNT_TODAY_METRIC_STATUSES.Partial
              : ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        completeCount: completeIds.size,
        partialCount: partialIds.size,
        eligibleCount: enabled.length,
        legacyUnclassifiedCount,
      }
      if (compatible.length) {
        const first = compatible[0]!
        if (first.fact.asset.kind === ASSET_KINDS.Unknown) continue
        let value: string
        try {
          value = sumDecimals(compatible.map(({ value }) => value))
        } catch {
          for (const candidate of compatible)
            incomplete.add(`${candidate.id}:${asset}`)
          continue
        }
        let cnyValue: string | undefined
        let usdValue: string | undefined
        if (
          first.fact.asset.kind === ASSET_KINDS.Currency &&
          first.fact.asset.code === CURRENCIES.USD
        ) {
          try {
            cnyValue = sumDecimals(
              compatible.map(({ id, value }) =>
                convertUsdToCny(value, rates.get(id)),
              ),
            )
          } catch {
            // A failed conversion keeps the original group's amount available.
          }
        }
        if (
          first.fact.asset.kind === ASSET_KINDS.Currency &&
          first.fact.asset.code === CURRENCIES.CNY
        ) {
          try {
            usdValue = sumDecimals(
              compatible.map(({ id, value }) =>
                convertCnyToUsd(value, rates.get(id)),
              ),
            )
          } catch {
            // Retain the native amount if a display conversion cannot be represented.
          }
        }
        groups.push({
          amount: { asset: first.fact.asset, value },
          ...(cnyValue === undefined ? {} : { cnyValue }),
          ...(usdValue === undefined ? {} : { usdValue }),
          window: first.fact.window,
          coverage,
        })
        for (const candidate of compatible) nativeIncluded.add(candidate.id)
        for (const id of completeIds) nativeComplete.add(id)
        if (
          windows.size === 1 &&
          parseDecimal(Number(value)) === value &&
          first.fact.asset.kind === ASSET_KINDS.Currency &&
          (first.fact.asset.code === CURRENCIES.USD ||
            first.fact.asset.code === CURRENCIES.CNY)
        ) {
          amount[first.fact.asset.code] = Number(value)
          coverageByCurrency[first.fact.asset.code] = coverage
        }
      }
    }
  }
  for (const id of nativeComplete) {
    if ([...incomplete].some((key) => key === id || key.startsWith(`${id}:`)))
      nativeComplete.delete(id)
  }
  if (new Set(groups.map((group) => JSON.stringify(group.window))).size > 1)
    nativeComplete.clear()
  const nativeCoverage: AccountMetricCoverage = {
    status:
      nativeComplete.size === enabled.length && enabled.length > 0
        ? ACCOUNT_TODAY_METRIC_STATUSES.Complete
        : nativeIncluded.size > 0
          ? ACCOUNT_TODAY_METRIC_STATUSES.Partial
          : ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    completeCount: nativeComplete.size,
    partialCount: nativeIncluded.size - nativeComplete.size,
    eligibleCount: enabled.length,
    legacyUnclassifiedCount,
  }
  return {
    amount,
    coverage: coverageByCurrency.USD,
    coverageByCurrency,
    groups,
    nativeCoverage,
    excludedAccounts: accounts.flatMap((account) =>
      nativeIncluded.has(account.id)
        ? []
        : [
            {
              accountId: account.id,
              reason: account.disabled
                ? FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Disabled
                : account.excludedBySettings
                  ? FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Settings
                  : (excluded.get(account.id) ??
                    (!account.observations?.length
                      ? account.availabilityReason
                      : undefined) ??
                    FINANCIAL_ACCOUNT_EXCLUSION_REASONS.NoUsableData),
            },
          ],
    ),
  }
}
