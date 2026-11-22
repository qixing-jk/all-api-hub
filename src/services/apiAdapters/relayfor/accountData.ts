import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
  parseAllowanceInstant,
} from "~/services/accounts/allowances"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import { normalizeDecimalUnits } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_LABEL_KEYS,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  EVIDENCE_KINDS,
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
  quotaToUsd,
  RELAYFOR_ENDPOINTS,
  RELAYFOR_QUOTA_PER_USD,
} from "~/services/apiService/relayfor/constants"
import { isRecord } from "~/services/apiService/relayfor/parsing"
import type {
  AccountBalanceComponent,
  AccountTodayMetricAvailability,
  AccountTodayStatsAvailability,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types"

const COMPLETE_METRIC: AccountTodayMetricAvailability = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
}

const UNSUPPORTED_INCOME: AccountTodayMetricAvailability = {
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
}

/**
 * Fetches RelayFor overview and converts it to AccountData.
 */
export async function fetchRelayForAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const overview = await fetchRelayForOverview(request)

  const today = overview.today
  const totalRequests = overview.requests ?? 0
  const totalTokens =
    (overview.input_tokens ?? 0) + (overview.output_tokens ?? 0) ||
    overview.token_count ||
    0
  const totalQuota = overview.total_quota
  const now = Date.now()
  const subscriptions = (overview.active_subscriptions ?? []).filter(
    (item) =>
      item.status === 1 &&
      (parseAllowanceInstant(item.starts_at) === undefined ||
        parseAllowanceInstant(item.starts_at)! <= now) &&
      (parseAllowanceInstant(item.expires_at) === undefined ||
        parseAllowanceInstant(item.expires_at)! > now),
  )
  const components: AccountBalanceComponent[] = [
    { kind: "permanent", amount: quotaToUsd(overview.user.quota) },
    { kind: "timed", amount: quotaToUsd(overview.timed_quota ?? 0) },
    ...subscriptions.map((item): AccountBalanceComponent => ({
      kind: "subscription",
      name: item.plan_name ?? item.plan_code,
      amount: item.unlimited_quota
        ? 0
        : quotaToUsd(Math.max(0, item.quota_remaining ?? 0)),
      unlimited: item.unlimited_quota,
      expiresAt: item.expires_at,
      resetAt: item.next_reset_at,
      scope: item.quota_group || undefined,
      unlockedModels: Object.keys(item.model_rules ?? {}),
    })),
    ...(overview.group_quotas ?? []).flatMap(
      (item): AccountBalanceComponent[] => {
        if (
          !item ||
          typeof item !== "object" ||
          !("quota" in item) ||
          typeof item.quota !== "number"
        )
          return []
        return [
          {
            kind: "group",
            amount: quotaToUsd(item.quota),
            scope: "quota_group" in item ? String(item.quota_group) : undefined,
          },
        ]
      },
    ),
  ]

  let timedDetails: AccountBalanceComponent[] | undefined
  let timedDetailsUnavailable = false
  let timedObservedAt = now
  if ((overview.timed_quota ?? 0) > 0) {
    try {
      const grants = await fetchRelayForTimedQuotas(request)
      timedObservedAt = Date.now()
      timedDetails = grants
        .flatMap((item): AccountBalanceComponent[] => {
          if (
            !isRecord(item) ||
            item.status !== 1 ||
            typeof item.quota_remaining !== "number" ||
            !Number.isFinite(item.quota_remaining) ||
            item.quota_remaining <= 0 ||
            typeof item.expires_at !== "string" ||
            (parseAllowanceInstant(item.expires_at) !== undefined &&
              parseAllowanceInstant(item.expires_at)! <= timedObservedAt) ||
            !Number.isFinite(Date.parse(item.expires_at))
          )
            return []
          return [
            {
              kind: "timed",
              name: typeof item.name === "string" ? item.name : undefined,
              amount: quotaToUsd(item.quota_remaining),
              scope:
                typeof item.quota_group === "string"
                  ? item.quota_group
                  : undefined,
              expiresAt: item.expires_at,
            },
          ]
        })
        .sort(
          (a, b) =>
            Date.parse(a.expiresAt ?? "") - Date.parse(b.expiresAt ?? ""),
        )
    } catch {
      timedDetailsUnavailable = true
    }
  }

  const todayStatsAvailability: AccountTodayStatsAvailability = {
    consumption: metric(today?.quota),
    requests: metric(today?.requests),
    tokens: metric(
      today?.tokens ??
        (typeof today?.input_tokens === "number" &&
        typeof today?.output_tokens === "number"
          ? today.input_tokens + today.output_tokens
          : undefined),
    ),
    income: UNSUPPORTED_INCOME,
  }

  const scope = accountBalanceScope(request, {
    walletId: String(overview.user.id),
  })
  const asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD } as const
  const source = {
    adapter: SITE_TYPES.RELAYFOR,
    operation: RELAYFOR_ENDPOINTS.overview,
    contractVersion: "usd-quota-500000/v1",
    kind: EVIDENCE_KINDS.Reported,
  } as const
  const plansSource = {
    ...source,
    operation: `${source.operation}:active_subscriptions`,
  }
  const collectionKey = "active-subscriptions"
  const plans = subscriptions.map((item, index) => {
    const label = item.plan_name ?? item.plan_code
    const expiresAt = parseAllowanceInstant(item.expires_at)
    const models = Object.keys(item.model_rules ?? {})
    return {
      id: `plan:${index}`,
      collectionKey,
      label,
      identityKind: ALLOWANCE_IDENTITY_KINDS.ObservationOnly,
      reportedTiming: {
        expiresAt: item.expires_at,
        startsAt: item.starts_at,
        resetsAt: item.next_reset_at,
      },
      validity:
        expiresAt === undefined
          ? ({ kind: BALANCE_VALIDITY_KINDS.Unknown } as const)
          : ({ kind: BALANCE_VALIDITY_KINDS.Expires, at: expiresAt } as const),
      constraint: budgetConstraint({
        scope: {
          ...scope,
          groups: item.quota_group
            ? {
                kind: SCOPE_SELECTION_KINDS.Restricted,
                ids: [item.quota_group],
              }
            : scope.groups,
          models: models.length
            ? { kind: SCOPE_SELECTION_KINDS.Restricted, ids: models }
            : scope.models,
        },
        asset,
        source: plansSource,
        observedAt: now,
        limitState: item.unlimited_quota
          ? BUDGET_LIMIT_STATES.Unlimited
          : BUDGET_LIMIT_STATES.Finite,
        limit: normalizeDecimalUnits(item.quota_total, RELAYFOR_QUOTA_PER_USD),
        remaining: normalizeDecimalUnits(
          item.quota_remaining,
          RELAYFOR_QUOTA_PER_USD,
        ),
        enabled: true,
      }),
    }
  })
  return {
    ...accountBalanceObservation(
      scope,
      [
        balancePosition({
          id: "wallet",
          collectionKey: WALLET_BALANCE_COLLECTION_KEY,
          scope,
          asset,
          source,
          observedAt: now,
          value: normalizeDecimalUnits(
            overview.user.quota,
            RELAYFOR_QUOTA_PER_USD,
          ),
        }),
        ...(overview.timed_quota === undefined
          ? []
          : [
              balancePosition({
                id: "timed-quota",
                collectionKey: WALLET_BALANCE_COLLECTION_KEY,
                scope,
                asset,
                source,
                observedAt: now,
                value: normalizeDecimalUnits(
                  overview.timed_quota,
                  RELAYFOR_QUOTA_PER_USD,
                ),
                labelKey: BALANCE_LABEL_KEYS.Timed,
              }),
            ]),
        ...(timedDetails ?? []).map((detail, index) => {
          const expiry = parseAllowanceInstant(detail.expiresAt)
          return balancePosition({
            id: `timed-grant:${index}`,
            parentId: "timed-quota",
            relation: BALANCE_RELATIONS.Component,
            collectionKey: WALLET_BALANCE_COLLECTION_KEY,
            scope: {
              ...scope,
              groups: detail.scope
                ? {
                    kind: SCOPE_SELECTION_KINDS.Restricted,
                    ids: [detail.scope],
                  }
                : scope.groups,
            },
            asset,
            source: { ...source, inputs: [RELAYFOR_ENDPOINTS.timedQuotas] },
            observedAt: timedObservedAt,
            value: detail.amount,
            label: detail.name,
            reportedTiming: { expiresAt: detail.expiresAt },
            ...(expiry === undefined
              ? {}
              : {
                  validity: {
                    kind: BALANCE_VALIDITY_KINDS.Expires,
                    at: expiry,
                  },
                }),
          })
        }),
        ...components
          .filter((component) => component.kind === "group")
          .map((component, index) =>
            balancePosition({
              id: `group:${index}`,
              role: BALANCE_ROLES.Allowance,
              collectionKey: WALLET_BALANCE_COLLECTION_KEY,
              scope: {
                ...scope,
                groups: component.scope
                  ? {
                      kind: SCOPE_SELECTION_KINDS.Restricted,
                      ids: [component.scope],
                    }
                  : scope.groups,
              },
              asset,
              source,
              observedAt: now,
              value: component.amount,
              label: component.scope,
            }),
          ),
      ],
      now,
      timedDetailsUnavailable
        ? FINANCIAL_ENUMERATION.Partial
        : FINANCIAL_ENUMERATION.Complete,
    ),
    ...accountAllowanceObservation(
      scope,
      [
        {
          source: plansSource,
          collectionKey,
          enumeration:
            overview.active_subscriptions === undefined ||
            subscriptions.some(
              (item) =>
                parseAllowanceInstant(item.starts_at) === undefined ||
                parseAllowanceInstant(item.expires_at) === undefined,
            )
              ? FINANCIAL_ENUMERATION.Partial
              : FINANCIAL_ENUMERATION.Complete,
          entries: plans,
        },
      ],
      now,
    ),
    quota: overview.user.quota,
    nativeBalance: {
      unit: "USD",
      permanent: quotaToUsd(overview.user.quota),
      daily: quotaToUsd(overview.timed_quota ?? 0),
      total: components
        .filter((item) => item.kind !== "group")
        .reduce((sum, item) => sum + item.amount, 0),
      components,
      timedDetails,
      timedDetailsUnavailable,
    },
    subscription: subscriptions.length
      ? {
          name: subscriptions
            .map((item) => item.plan_name ?? item.plan_code)
            .filter(Boolean)
            .join(" · "),
          isActive: true,
        }
      : undefined,
    today_quota_consumption: today?.quota ?? 0,
    today_prompt_tokens: today?.input_tokens ?? 0,
    today_completion_tokens:
      today?.output_tokens ??
      Math.max(0, (today?.tokens ?? 0) - (today?.input_tokens ?? 0)),
    today_requests_count: today?.requests ?? 0,
    today_income: 0,
    todayStatsAvailability,
    usage:
      typeof totalQuota === "number" && Number.isFinite(totalQuota)
        ? {
            scope: "lifetime",
            totalRequests,
            totalTokens,
            totalCost: quotaToUsd(totalQuota),
          }
        : undefined,
    checkIn: request.checkIn,
  }
}

const metric = (value: unknown): AccountTodayMetricAvailability =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? COMPLETE_METRIC
    : {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
      }

export const relayForAccountData: AccountDataCapability = {
  fetchData: (request) => fetchRelayForAccountData(request),
}
