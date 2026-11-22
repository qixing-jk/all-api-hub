import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
  parseAllowanceInstant,
  type AccountAllowanceEntry,
} from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  balancePosition,
  observeAmount,
  type BalanceRefreshPart,
  type UsageScope,
} from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import { normalizeDecimalUnits } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  SCOPE_SELECTION_KINDS,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import {
  fetchRelayForOverview,
  fetchRelayForTimedQuotas,
} from "~/services/apiService/relayfor"
import {
  RELAYFOR_ENDPOINTS,
  RELAYFOR_QUOTA_PER_USD,
} from "~/services/apiService/relayfor/constants"
import { isRecord } from "~/services/apiService/relayfor/parsing"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  type AccountTodayMetricAvailability,
} from "~/types"

/** Preserve each source and scope; a displayed aggregate does not prove fungibility. */
export async function fetchRelayForAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const overview = await fetchRelayForOverview(request)
  const observedAt = Date.now()
  const scope = accountBalanceScope(request)
  const source = {
    adapter: "relayfor",
    operation: RELAYFOR_ENDPOINTS.overview,
    contractVersion: "quota-usd/v1",
    kind: EVIDENCE_KINDS.Reported,
  }
  const usd = (value: unknown) =>
    normalizeDecimalUnits(value, RELAYFOR_QUOTA_PER_USD)
  const scoped = (raw: Record<string, unknown>): UsageScope => ({
    ...scope,
    groups:
      typeof raw.quota_group === "string" && raw.quota_group
        ? { kind: SCOPE_SELECTION_KINDS.Restricted, ids: [raw.quota_group] }
        : { kind: SCOPE_SELECTION_KINDS.Unknown },
    models:
      isRecord(raw.model_rules) && Object.keys(raw.model_rules).length
        ? {
            kind: SCOPE_SELECTION_KINDS.Restricted,
            ids: Object.keys(raw.model_rules),
          }
        : { kind: SCOPE_SELECTION_KINDS.Unknown },
  })
  const parts: BalanceRefreshPart[] = [
    {
      collectionKey: WALLET_BALANCE_COLLECTION_KEY,
      source,
      enumeration: FINANCIAL_ENUMERATION.Complete,
      positions: [
        balancePosition({
          id: "permanent",
          labelKey: "permanentBalance",
          collectionKey: WALLET_BALANCE_COLLECTION_KEY,
          scope,
          source,
          observedAt,
          value: usd(overview.user.quota),
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          role: BALANCE_ROLES.Available,
          nature: BALANCE_NATURES.Prepaid,
        }),
        balancePosition({
          id: "timed",
          labelKey: "timedBalance",
          collectionKey: WALLET_BALANCE_COLLECTION_KEY,
          scope,
          source,
          observedAt,
          value: usd(overview.timed_quota),
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          role: BALANCE_ROLES.Available,
        }),
      ],
    },
  ]
  if (usd(overview.timed_quota) !== undefined)
    parts.push({
      collectionKey: "timed-summary",
      source,
      enumeration: FINANCIAL_ENUMERATION.Complete,
      positions: [],
    })
  const groups = overview.group_quotas
  parts.push({
    collectionKey: "groups",
    source,
    enumeration:
      Array.isArray(groups) && groups.every(isRecord)
        ? FINANCIAL_ENUMERATION.Complete
        : FINANCIAL_ENUMERATION.Partial,
    positions: (Array.isArray(groups) ? groups : []).flatMap((raw, index) => {
      if (!isRecord(raw)) return []
      const id =
        typeof raw.quota_group === "string" && raw.quota_group
          ? `group:${raw.quota_group}`
          : `unidentified:${observedAt}:${index}`
      return [
        balancePosition({
          id,
          collectionKey: "groups",
          scope: scoped(raw),
          source,
          observedAt,
          value: usd(raw.quota),
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          role: BALANCE_ROLES.Available,
        }),
      ]
    }),
  })
  const timedSource = {
    ...source,
    operation: RELAYFOR_ENDPOINTS.timedQuotas,
    inputs: [RELAYFOR_ENDPOINTS.timedQuotas],
  }
  let grants: unknown[] | undefined
  if (usd(overview.timed_quota) === "0") grants = []
  else
    try {
      grants = await fetchRelayForTimedQuotas(request)
    } catch {
      /* A failed detail read does not erase the verified overview. */
    }
  const grantAt = Date.now()
  parts.push({
    source: timedSource,
    collectionKey: "timed-grants",
    enumeration:
      grants === undefined
        ? FINANCIAL_ENUMERATION.Unavailable
        : grants.every(
              (grant) => isRecord(grant) && Number.isSafeInteger(grant.status),
            )
          ? FINANCIAL_ENUMERATION.Complete
          : FINANCIAL_ENUMERATION.Partial,
    positions: (grants ?? []).flatMap((raw, index) => {
      if (!isRecord(raw) || raw.status !== 1) return []
      const id =
        typeof raw.id === "string" && raw.id
          ? raw.id
          : typeof raw.id === "number" && Number.isSafeInteger(raw.id)
            ? String(raw.id)
            : `unidentified:${grantAt}:${index}`
      const expiresAt = parseAllowanceInstant(raw.expires_at)
      return [
        balancePosition({
          id: `timed-grant:${id}`,
          collectionKey: "timed-grants",
          source: timedSource,
          scope: scoped(raw),
          observedAt: grantAt,
          value: usd(raw.quota_remaining),
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          role: BALANCE_ROLES.Ledger,
          validity:
            expiresAt === undefined
              ? { kind: BALANCE_VALIDITY_KINDS.Unknown }
              : { kind: BALANCE_VALIDITY_KINDS.Expires, at: expiresAt },
          ...(typeof raw.name === "string" ? { label: raw.name } : {}),
          ...(typeof raw.expires_at === "string"
            ? { reportedTiming: { expiresAt: raw.expires_at } }
            : {}),
        }),
      ]
    }),
  })
  const plans = overview.active_subscriptions
  const entries: AccountAllowanceEntry[] = (
    Array.isArray(plans) ? plans : []
  ).flatMap((raw, index) => {
    if (!isRecord(raw)) return []
    const id =
      typeof raw.id === "string" && raw.id
        ? raw.id
        : typeof raw.id === "number" && Number.isSafeInteger(raw.id)
          ? String(raw.id)
          : undefined
    const expiry = parseAllowanceInstant(raw.expires_at)
    return [
      {
        id: id ?? `unidentified:${observedAt}:${index}`,
        identityKind: id
          ? ALLOWANCE_IDENTITY_KINDS.Upstream
          : ALLOWANCE_IDENTITY_KINDS.ObservationOnly,
        collectionKey: "plans",
        label:
          typeof raw.plan_name === "string"
            ? raw.plan_name
            : typeof raw.plan_code === "string"
              ? raw.plan_code
              : undefined,
        validity:
          expiry === undefined
            ? { kind: BALANCE_VALIDITY_KINDS.Unknown }
            : { kind: BALANCE_VALIDITY_KINDS.Expires, at: expiry },
        reportedTiming: {
          ...(typeof raw.starts_at === "string"
            ? { startsAt: raw.starts_at }
            : {}),
          ...(typeof raw.expires_at === "string"
            ? { expiresAt: raw.expires_at }
            : {}),
          ...(typeof raw.next_reset_at === "string"
            ? { resetsAt: raw.next_reset_at }
            : {}),
        },
        constraint: budgetConstraint({
          scope: scoped(raw),
          source,
          observedAt,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          limitState:
            raw.unlimited_quota === true
              ? BUDGET_LIMIT_STATES.Unlimited
              : BUDGET_LIMIT_STATES.Finite,
          limit: usd(raw.quota_total),
          remaining: usd(raw.quota_remaining),
          enabled:
            typeof raw.status === "number" ? raw.status === 1 : undefined,
        }),
      },
    ]
  })
  const today = isRecord(overview.today) ? overview.today : undefined
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : undefined
  const todayRequests = count(today?.requests)
  const todayTokens = count(today?.tokens)
  const todayInput = count(today?.input_tokens)
  const todayOutput = count(today?.output_tokens)
  const lifetimeInput = count(overview.input_tokens)
  const lifetimeOutput = count(overview.output_tokens)
  const unsupported: AccountTodayMetricAvailability = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
  }
  const positions = parts.flatMap((part) => part.positions)
  const splitLifetimeTokens =
    lifetimeInput !== undefined && lifetimeOutput !== undefined
      ? lifetimeInput + lifetimeOutput
      : undefined
  const totalTokens =
    splitLifetimeTokens || (count(overview.token_count) ?? splitLifetimeTokens)
  return {
    balance: accountBalanceSnapshot(
      scope,
      positions,
      grantAt,
      parts.every((part) => part.enumeration === FINANCIAL_ENUMERATION.Complete)
        ? FINANCIAL_COVERAGE.Complete
        : FINANCIAL_COVERAGE.Partial,
    ),
    balanceRefreshParts: parts,
    ...accountAllowanceObservation(
      scope,
      [
        {
          source,
          collectionKey: "plans",
          enumeration:
            Array.isArray(plans) &&
            plans.every(
              (raw) =>
                isRecord(raw) &&
                [raw.starts_at, raw.expires_at, raw.next_reset_at].every(
                  (at) =>
                    at === undefined || parseAllowanceInstant(at) !== undefined,
                ),
            )
              ? FINANCIAL_ENUMERATION.Complete
              : FINANCIAL_ENUMERATION.Partial,
          entries,
        },
      ],
      observedAt,
    ),
    today_quota_consumption: 0,
    today_prompt_tokens:
      todayInput ??
      (todayOutput === undefined
        ? 0
        : Math.max(0, (todayTokens ?? 0) - todayOutput)),
    today_completion_tokens:
      todayOutput ?? Math.max(0, (todayTokens ?? 0) - (todayInput ?? 0)),
    today_requests_count: todayRequests ?? 0,
    today_income: 0,
    todayStatsAvailability: {
      consumption: unsupported,
      income: unsupported,
      requests: metric(todayRequests),
      tokens: metric(
        todayTokens ??
          (todayInput !== undefined && todayOutput !== undefined
            ? todayInput + todayOutput
            : undefined),
      ),
    },
    usage: {
      scope: ACCOUNT_USAGE_SCOPES.Lifetime,
      totalRequests: count(overview.requests),
      totalTokens,
      cost: {
        scope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        amount: observeAmount(
          usd(overview.total_quota),
          { ...source, inputs: ["total_quota"] },
          observedAt,
        ),
      },
    },
    usageObservations: [
      {
        scope: ACCOUNT_USAGE_SCOPES.SiteToday,
        cost: {
          scope,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          amount: observeAmount(
            usd(today?.quota),
            { ...source, inputs: ["today.quota"] },
            observedAt,
          ),
        },
      },
    ],
    checkIn: request.checkIn,
  }
}
const metric = (value: unknown): AccountTodayMetricAvailability =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete }
    : {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
      }
export const relayForAccountData: AccountDataCapability = {
  fetchData: fetchRelayForAccountData,
}
