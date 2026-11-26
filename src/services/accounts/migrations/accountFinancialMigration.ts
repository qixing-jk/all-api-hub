import { CURRENCIES } from "~/constants/money"
import { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/constants/siteType"
import { readAccountBalance } from "~/services/accounts/balanceSnapshot"
import { hasRecordedCashflowAmount } from "~/services/accounts/metrics/consumptionProjection"
import {
  currentDailyUsdContract,
  normalizeRecordedDailyReportScope,
} from "~/services/accounts/migrations/financialObservationCompatibility"
import { isCompatibleAccountFamily } from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import {
  balanceSnapshotSchema,
  isKnownOrStaleObservation,
  type BalanceSnapshot,
  type UsageScope,
} from "~/services/amounts/balance"
import { parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_NATURES,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import type { AccountInfo, AccountUsageSummary, SiteAccount } from "~/types"
import { isPlainObject } from "~/utils/core/object"

/** Quota-based compatibility evidence, with independent timestamps for refreshed counters. */
export type LegacyAccountFinancialEvidence = {
  schemaVersion: 1
  capturedAt: number
  quota?: unknown
  nativeBalance?: unknown
  balanceUnavailable?: unknown
  /** Saved readings belong to the previous upstream account after an identity edit. */
  identityInvalidated?: boolean
  /** An empty object records that the release did not save either value. */
  cashflow?: { consumption?: unknown; income?: unknown }
  cashflowCapturedAt?: { consumption?: number; income?: number }
}

/** Daya's earlier daily amount lived in usage, not in a settled-charge fact. */
function normalizeCurrentUsageContract(
  usage: AccountUsageSummary | undefined,
  siteType: SiteAccount["site_type"] | undefined,
): AccountUsageSummary | undefined {
  const cost = usage?.cost
  const source = cost?.amount.source
  const contractVersion =
    cost && source ? currentDailyUsdContract(cost.asset, source) : undefined
  if (
    !usage ||
    !cost ||
    !source ||
    !siteType ||
    getAccountSiteDefinition(siteType)?.adapterFamily !==
      ACCOUNT_SITE_ADAPTER_FAMILIES.Daya ||
    !isKnownOrStaleObservation(cost.amount) ||
    contractVersion !== "wallet-usd/v1"
  )
    return usage
  return {
    ...usage,
    cost: {
      ...cost,
      ...(cost.scope
        ? {
            scope: normalizeRecordedDailyReportScope(
              cost.scope,
              cost.asset,
              source,
            ),
          }
        : {}),
      amount: { ...cost.amount, source: { ...source, contractVersion } },
    },
  }
}

/** Normalize active dev contract tags without rewriting archived observations. */
function normalizeCurrentConsumptionContracts(
  info: AccountInfo,
  balance: BalanceSnapshot,
  siteType: SiteAccount["site_type"] | undefined,
): AccountInfo["settledConsumption"] {
  const adapterFamily = siteType
    ? getAccountSiteDefinition(siteType)?.adapterFamily
    : undefined
  return info.settledConsumption?.map((fact) => {
    const source = fact.amount.source
    if (
      fact.asset.kind !== ASSET_KINDS.Currency ||
      fact.asset.code !== CURRENCIES.USD ||
      source.kind !== EVIDENCE_KINDS.Reported ||
      !isKnownOrStaleObservation(fact.amount)
    )
      return fact
    let contractVersion: string | undefined
    const dailyContractVersion = currentDailyUsdContract(fact.asset, source)
    let dailyReporting = false
    let cumulative = fact.cumulative
    if (
      adapterFamily === ACCOUNT_SITE_ADAPTER_FAMILIES.Daya &&
      dailyContractVersion === "wallet-usd/v1"
    ) {
      contractVersion = "wallet-usd/v1"
      dailyReporting = true
    } else if (
      adapterFamily === ACCOUNT_SITE_ADAPTER_FAMILIES.AiMlApi &&
      dailyContractVersion === "1"
    ) {
      contractVersion = "1"
      dailyReporting = true
      // The old full-day query was a cumulative reading as of its original clock.
      const at = fact.amount.observedAt
      const start = new Date(fact.window.start)
      if (
        cumulative === undefined &&
        fact.window.timeZone === "UTC" &&
        start.getUTCHours() === 0 &&
        start.getUTCMinutes() === 0 &&
        start.getUTCSeconds() === 0 &&
        start.getUTCMilliseconds() === 0 &&
        fact.window.end === fact.window.start + 86_400_000 &&
        at >= fact.window.start &&
        at <= fact.window.end
      )
        cumulative = true
    } else if (
      isCompatibleAccountFamily(adapterFamily) &&
      source.adapter === siteType &&
      (source.operation === "/api/log/self/stat:quota" ||
        source.operation === "/api/log/self:consumption") &&
      source.contractVersion === NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd
    ) {
      const wallet = balance.positions.find(
        (position) =>
          position.asset.kind === ASSET_KINDS.Currency &&
          position.asset.code === CURRENCIES.USD &&
          position.amount.source.adapter === source.adapter &&
          position.amount.source.operation === "/api/user/self:balance" &&
          position.amount.source.contractVersion === "usd-balance/v1" &&
          position.amount.source.kind === EVIDENCE_KINDS.Reported &&
          position.scope.subject.kind === FINANCIAL_SUBJECT_KINDS.Account &&
          fact.scope.subject.kind === FINANCIAL_SUBJECT_KINDS.Account &&
          position.scope.subject.accountId === fact.scope.subject.accountId &&
          position.scope.authority === fact.scope.authority &&
          (!position.scope.walletId ||
            position.scope.walletId === fact.scope.walletId) &&
          (!position.scope.organizationId ||
            position.scope.organizationId === fact.scope.organizationId) &&
          (!position.scope.workspaceId ||
            position.scope.workspaceId === fact.scope.workspaceId),
      )
      if (wallet) contractVersion = wallet.amount.source.contractVersion
    }
    return contractVersion
      ? {
          ...fact,
          ...(dailyReporting
            ? {
                scope: normalizeRecordedDailyReportScope(
                  fact.scope,
                  fact.asset,
                  source,
                ),
              }
            : {}),
          ...(cumulative === undefined ? {} : { cumulative }),
          amount: { ...fact.amount, source: { ...source, contractVersion } },
        }
      : fact
  })
}

/** Novita saved these operands explicitly in the release's USD balance. */
function restoreNovitaDetails(
  balance: BalanceSnapshot,
  native: unknown,
): BalanceSnapshot {
  const parent = balance.positions.find(({ id }) => id === "legacy")
  if (
    !parent ||
    parent.amount.status !== OBSERVATION_STATUSES.Stale ||
    parent.asset.kind !== ASSET_KINDS.Currency ||
    parent.asset.code !== CURRENCIES.USD ||
    !isPlainObject(native) ||
    native.unit !== CURRENCIES.USD
  )
    return balance

  const credit = Array.isArray(native.components)
    ? native.components.find(
        (component) =>
          isPlainObject(component) && component.name === "Credit limit",
      )
    : undefined
  const stored = [
    {
      id: "legacy-cash",
      role: BALANCE_ROLES.Ledger,
      value: native.permanent,
      nature: BALANCE_NATURES.Prepaid,
      cashClassification: BALANCE_CASH_CLASSIFICATIONS.ReportedCash,
    },
    {
      id: "legacy-credit-limit",
      role: BALANCE_ROLES.CreditLimit,
      value: credit?.amount,
      nature: BALANCE_NATURES.Credit,
      cashClassification: BALANCE_CASH_CLASSIFICATIONS.NotCash,
    },
  ]
  const observation = parent.amount
  const positions = stored.flatMap(({ value: raw, ...details }) => {
    const value = parseDecimal(raw)
    return value === undefined ||
      balance.positions.some(({ id }) => id === details.id)
      ? []
      : [{ ...parent, ...details, amount: { ...observation, value } }]
  })
  return { ...balance, positions: [...balance.positions, ...positions] }
}

/** Archive legacy inputs and retain only validated native financial facts. */
export function migrateAccountFinancialInfo(
  info: AccountInfo = {} as AccountInfo,
  context: {
    accountId: string
    siteUrl: string
    capturedAt: number
    siteType?: SiteAccount["site_type"]
  },
): AccountInfo {
  let authority = "legacy:unknown-authority"
  try {
    authority = new URL(context.siteUrl).origin
  } catch {
    /* Legacy URLs can be incomplete. */
  }
  const scope: UsageScope = {
    subject: {
      kind: FINANCIAL_SUBJECT_KINDS.Account,
      ...(context.accountId ? { accountId: context.accountId } : {}),
    },
    authority,
    keys: { kind: SCOPE_SELECTION_KINDS.Unknown },
    models: { kind: SCOPE_SELECTION_KINDS.Unknown },
    projects: { kind: SCOPE_SELECTION_KINDS.Unknown },
    groups: { kind: SCOPE_SELECTION_KINDS.Unknown },
  }
  const oldFields = ["quota", "nativeBalance", "balanceUnavailable"] as const
  const hasLegacy = oldFields.some((field) => info[field] !== undefined)
  const cashflow =
    info.legacyFinancial?.cashflow ??
    (!info.balance || hasLegacy || info.legacyFinancial
      ? {
          ...(hasRecordedCashflowAmount(info.settledConsumption) ||
          !Object.hasOwn(info, "today_quota_consumption")
            ? {}
            : { consumption: info.today_quota_consumption }),
          ...(hasRecordedCashflowAmount(info.reportedIncome) ||
          !Object.hasOwn(info, "today_income")
            ? {}
            : { income: info.today_income }),
        }
      : undefined)
  const legacyFinancial = info.legacyFinancial
    ? { ...info.legacyFinancial, cashflow }
    : hasLegacy || cashflow !== undefined
      ? {
          schemaVersion: 1 as const,
          capturedAt: context.capturedAt,
          cashflow,
          ...Object.fromEntries(
            oldFields
              .filter((field) => info[field] !== undefined)
              .map((field) => [field, info[field]]),
          ),
        }
      : undefined
  const empty = {
    schemaVersion: 2 as const,
    subject: scope.subject,
    capturedAt: context.capturedAt,
    positions: [],
    coverage: FINANCIAL_COVERAGE.Unknown,
  }
  const migrated = hasLegacy
    ? balanceSnapshotSchema.safeParse(
        readAccountBalance(info, scope, context.capturedAt),
      )
    : undefined
  const balance = info.balance ?? (migrated?.success ? migrated.data : empty)
  const {
    quota: _quota,
    nativeBalance: _native,
    balanceUnavailable: _unavailable,
    ...current
  } = info
  if (
    current.usageObservations !== undefined &&
    (!Array.isArray(current.usageObservations) ||
      current.usageObservations.some((usage) => !isPlainObject(usage)))
  )
    throw new Error("invalid_account_usage_observation")
  return {
    ...current,
    ...(current.usage === undefined
      ? {}
      : {
          usage: normalizeCurrentUsageContract(current.usage, context.siteType),
        }),
    ...(current.usageObservations === undefined
      ? {}
      : {
          usageObservations: current.usageObservations.map((usage) =>
            normalizeCurrentUsageContract(usage, context.siteType)!,
          ),
        }),
    ...(current.settledConsumption === undefined
      ? {}
      : {
          settledConsumption: normalizeCurrentConsumptionContracts(
            current,
            balance,
            context.siteType,
          ),
        }),
    balance:
      legacyFinancial?.nativeBalance !== undefined &&
      context.siteType &&
      getAccountSiteDefinition(context.siteType)?.adapterFamily ===
        ACCOUNT_SITE_ADAPTER_FAMILIES.Novita
        ? restoreNovitaDetails(balance, legacyFinancial?.nativeBalance)
        : balance,
    ...(legacyFinancial ? { legacyFinancial } : {}),
  }
}
