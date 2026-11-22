import { CURRENCIES } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
  type AccountAllowanceEntry,
} from "~/services/accounts/allowances"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { FREEMODEL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { balancePosition } from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import { normalizeDecimalUnits, sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_FUNDING,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"

import { FREEMODEL_ME_ENDPOINT } from "./constants"

const invalid = (endpoint: string) =>
  new ApiError(
    "Invalid FreeModel response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

// https://freemodel.dev/dashboard (verified 2026-10-04): console calls use
// cookies, with plain JSON rather than a New API success/data envelope.
/** Keep console credentials bound to the verified browser origin. */
export async function readFreeModelConsoleResponse(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  if (
    new URL(request.baseUrl).origin !== FREEMODEL_WEB_ORIGIN ||
    request.auth.authType !== AuthTypeEnum.Cookie
  ) {
    throw new ApiError(
      "FreeModel requires its console cookie session",
      undefined,
      endpoint,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
  }
  const body = await fetchApi<unknown>(
    { ...request, auth: { ...request.auth, accessToken: undefined } },
    { endpoint, options: { cache: "no-store", ...options } },
    true,
  )
  if (!isRecord(body)) throw invalid(endpoint)
  return body
}

/** Verify the live session before using saved account identity or mutating keys. */
export async function fetchUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const body = await readFreeModelConsoleResponse(
    request,
    FREEMODEL_ME_ENDPOINT,
  )
  const user = body.user
  if (
    !isRecord(user) ||
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0
  )
    throw invalid(FREEMODEL_ME_ENDPOINT)
  if (
    request.auth.userId !== undefined &&
    String(request.auth.userId) !== String(user.id)
  ) {
    throw new ApiError(
      "FreeModel account identity mismatch",
      undefined,
      FREEMODEL_ME_ENDPOINT,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  }
  return {
    id: String(user.id),
    username: typeof user.name === "string" ? user.name : "",
    access_token: null,
  }
}

/** Load the provider-owned referral code without altering referral state. */
export async function fetchInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  await fetchUserInfo(request)
  const referral = await readFreeModelConsoleResponse(request, "/api/referral")
  if (typeof referral.code !== "string" || !referral.code.trim()) {
    throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
  }
  // https://freemodel.dev/dashboard/refer (verified 2026-10-04) builds
  // /invite/<code>; this is not New API's /register?aff= convention.
  return `${FREEMODEL_WEB_ORIGIN}/invite/${encodeURIComponent(referral.code.trim())}`
}

/** Fetch stored credit and subscription allowance without fabricating daily stats. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  await fetchUserInfo(request)
  const [billingObservation, usageObservation] = await Promise.all([
    readFreeModelConsoleResponse(request, "/api/billing").then((data) => ({
      data,
      at: Date.now(),
    })),
    readFreeModelConsoleResponse(request, "/api/usage")
      .then((data) => ({ data, at: Date.now() }))
      .catch(() => ({ data: undefined, at: Date.now() })),
  ])
  const { data: billing, at: observedAt } = billingObservation
  const { data: usageData, at: usageAt } = usageObservation
  const usage = usageData ?? {}
  const plan = isRecord(billing.subscription) ? billing.subscription : undefined
  const scope = accountBalanceScope(request)
  const source = {
    adapter: "freemodel",
    operation: "/api/billing",
    contractVersion: "credit-cents/v1",
    kind: EVIDENCE_KINDS.Reported,
  }
  const usd = (value: unknown) => normalizeDecimalUnits(value, 100)
  const purchased = usd(billing.creditCents),
    granted = usd(billing.signupCreditCents)
  let total: string | undefined
  if (purchased !== undefined && granted !== undefined) {
    try {
      total = sumDecimals([purchased, granted])
    } catch {
      // A bounded derived total must not discard independently valid credits.
    }
  }
  const positions = [
    balancePosition({
      id: "available",
      collectionKey: "credits",
      scope,
      value: total,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      nature: BALANCE_NATURES.Prepaid,
      funding: BALANCE_FUNDING.Mixed,
      source: {
        ...source,
        kind: EVIDENCE_KINDS.Derived,
        inputs: ["creditCents", "signupCreditCents"],
      },
      observedAt,
    }),
    ...(
      [
        ["purchased", purchased, "purchased"],
        ["signup-credit", granted, "granted"],
      ] as const
    ).map(([id, value, funding]) =>
      balancePosition({
        id,
        collectionKey: "credits",
        scope,
        value,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        nature: BALANCE_NATURES.Prepaid,
        funding,
        source,
        observedAt,
        parentId: "available",
        relation: BALANCE_RELATIONS.Component,
      }),
    ),
  ]
  const usageSource = {
    ...source,
    operation: "/api/usage",
    contractVersion: "allowance-cents/v1",
  }
  const planId = typeof plan?.planId === "string" ? plan.planId : "current-plan"
  const allowanceEntries: AccountAllowanceEntry[] = (
    ["5h", "week"] as const
  ).map((period) => {
    const window =
      period === BUDGET_PERIODS.FiveHours ? usage.window5h : usage.windowWeek
    const data = isRecord(window) ? window : {}
    const resetAt =
      typeof data.resetsAt === "number" && Number.isFinite(data.resetsAt)
        ? data.resetsAt * 1000
        : undefined
    return {
      id: `${planId}:${period}`,
      collectionKey: "usage-windows",
      label: planId,
      identityKind:
        typeof plan?.planId === "string"
          ? ALLOWANCE_IDENTITY_KINDS.Upstream
          : ALLOWANCE_IDENTITY_KINDS.SourceSlot,
      validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
      constraint: budgetConstraint({
        scope,
        source: usageSource,
        observedAt: usageAt,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        limitState: BUDGET_LIMIT_STATES.Finite,
        limit: usd(data.limitCents),
        used: usd(data.usedCents),
        remaining: usd(data.remainingCents),
        enabled:
          typeof plan?.status === "string"
            ? plan.status === "active"
            : undefined,
        window:
          period === BUDGET_PERIODS.FiveHours
            ? {
                kind: BUDGET_WINDOW_KINDS.Rolling,
                period,
                ...(resetAt !== undefined ? { resetsAt: resetAt } : {}),
              }
            : resetAt !== undefined
              ? {
                  kind: BUDGET_WINDOW_KINDS.Periodic,
                  period,
                  resetsAt: resetAt,
                }
              : { kind: BUDGET_WINDOW_KINDS.Unknown, period },
      }),
    }
  })
  return {
    // The UI quotes credits and rolling limits in USD (cents / 100); plan
    // purchase prices can be GBP. Rolling allowance is not stored balance.
    ...accountBalanceObservation(
      scope,
      positions,
      observedAt,
      FINANCIAL_ENUMERATION.Complete,
    ),
    ...accountAllowanceObservation(
      scope,
      [
        {
          source: usageSource,
          collectionKey: "usage-windows",
          enumeration:
            usageData === undefined
              ? FINANCIAL_ENUMERATION.Unavailable
              : isRecord(usage.window5h) && isRecord(usage.windowWeek)
                ? FINANCIAL_ENUMERATION.Complete
                : FINANCIAL_ENUMERATION.Partial,
          entries: allowanceEntries,
        },
      ],
      usageAt,
    ),
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
    checkIn: request.checkIn,
    subscription: {
      name: typeof plan?.planId === "string" ? plan.planId : undefined,
      isActive:
        typeof plan?.status === "string" ? plan.status === "active" : undefined,
      billingType: "amount",
    },
  }
}

export type FreeModelKey = {
  id: number
  name: string
  suffix: string
  created?: string
}

/** Retain only the verified inventory metadata. */
function parseKey(value: unknown): FreeModelKey {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.name !== "string" ||
    typeof value.suffix !== "string"
  )
    throw invalid("/api/keys")
  // Project metadata only; unexpected list fields must never become secrets.
  return {
    id: value.id,
    name: value.name,
    suffix: value.suffix,
    ...(typeof value.created === "string" ? { created: value.created } : {}),
  }
}

/** Read the suffix-only inventory for the matching account. */
export async function fetchKeys(
  request: ApiServiceRequest,
): Promise<FreeModelKey[]> {
  await fetchUserInfo(request)
  const body = await readFreeModelConsoleResponse(request, "/api/keys")
  if (!Array.isArray(body.keys)) throw invalid("/api/keys")
  return body.keys.map(parseKey)
}

/** Create once and deliver the response-only secret to the existing handoff UI. */
export async function createKey(
  request: ApiServiceRequest,
  name: string,
): Promise<{ key: FreeModelKey; secret: string }> {
  await fetchUserInfo(request)
  const body = await readFreeModelConsoleResponse(request, "/api/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  // https://freemodel.dev/dashboard/keys: secret is returned only once by POST;
  // GET returns suffix metadata. There is no verified reveal or update route.
  if (typeof body.secret !== "string" || !body.secret.trim())
    throw invalid("/api/keys")
  return { key: parseKey(body.key), secret: body.secret }
}

/** Delete a key only after verifying the saved account identity. */
export async function deleteKey(
  request: ApiServiceRequest,
  id: string,
): Promise<void> {
  if (!/^[1-9]\d*$/.test(id)) throw invalid("/api/keys")
  await fetchUserInfo(request)
  const result = await readFreeModelConsoleResponse(
    request,
    `/api/keys/${id}`,
    { method: "DELETE" },
  )
  if (result.ok !== true) throw invalid(`/api/keys/${id}`)
}
