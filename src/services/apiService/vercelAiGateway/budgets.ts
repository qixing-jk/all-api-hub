import { notifyApiTransportObserver } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import {
  VERCEL_ACCOUNT_ENDPOINTS,
  VERCEL_KEY_BUDGET_SCOPE_TYPE,
  VERCEL_TEAM_ID_QUERY_PARAM,
} from "./constants"
import {
  VERCEL_BUDGET_ALERT_THRESHOLDS,
  VERCEL_BUDGET_MINIMUM_USD,
  VERCEL_BUDGET_PERIODS,
  type VercelKeyBudget,
  type VercelKeyBudgetInput,
} from "./keys"
import {
  createVercelAccountRequest,
  vercelRequests,
  withVercelQuery,
} from "./request"

/** Budget reads are separate from key detail, which omits quota on the live deployment. */
export async function fetchVercelKeyBudgets(
  request: ApiServiceRequest,
  teamId: string,
  options?: { signal?: AbortSignal },
) {
  const read = (path: string) =>
    vercelRequests.payload<unknown>(
      {
        ...createVercelAccountRequest(request),
        abortSignal: options?.signal,
      },
      {
        endpoint: withVercelQuery(path, {
          [VERCEL_TEAM_ID_QUERY_PARAM]: teamId,
        }),
        options: { method: "GET", cache: "no-store" },
        tempWindowFallback: { statusCodes: [], codes: [] },
      },
    )
  const [body, defaults] = await Promise.all([
    read(VERCEL_ACCOUNT_ENDPOINTS.Budgets),
    read(VERCEL_ACCOUNT_ENDPOINTS.DefaultBudgets),
  ])
  if (
    !isRecord(body) ||
    !Array.isArray(body.budgets) ||
    !isRecord(defaults) ||
    !Array.isArray(defaults.defaults)
  )
    throw new Error("vercel_budgets_unreadable")
  const budgets = new Map<string, VercelKeyBudget>()
  for (const value of body.budgets) {
    if (!isRecord(value) || value.scopeType !== VERCEL_KEY_BUDGET_SCOPE_TYPE)
      continue
    const budget = parseVercelKeyBudget(value)
    if (!budget || typeof value.scopeId !== "string")
      throw new Error("vercel_budgets_unreadable")
    if (!budget.archived) budgets.set(value.scopeId, budget)
  }
  const defaultValue = defaults.defaults.find(
    (value) =>
      isRecord(value) && value.scopeType === VERCEL_KEY_BUDGET_SCOPE_TYPE,
  )
  const defaultBudget = defaultValue
    ? parseVercelKeyBudget(defaultValue, true)
    : null
  if (defaultValue && !defaultBudget)
    throw new Error("vercel_default_budget_unreadable")
  return {
    budgets,
    defaultBudget: defaultBudget?.archived ? null : defaultBudget,
  }
}

/** Strictly parse amounts; an unreadable budget must never become an empty editor. */
function parseVercelKeyBudget(
  value: unknown,
  isDefault = false,
): VercelKeyBudget | null {
  if (!isRecord(value)) return null
  const amount = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? v
      : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
        ? Number(v)
        : undefined
  const limitAmount = amount(value.limitAmount)
  const currentSpend = amount(value.currentSpend)
  if (
    limitAmount === undefined ||
    limitAmount < VERCEL_BUDGET_MINIMUM_USD ||
    (!isDefault && currentSpend === undefined) ||
    !VERCEL_BUDGET_PERIODS.includes(
      value.refreshPeriod as VercelKeyBudgetInput["refreshPeriod"],
    )
  )
    return null
  const alerts = value.alertThresholds ?? []
  if (
    !Array.isArray(alerts) ||
    alerts.some((a) => !VERCEL_BUDGET_ALERT_THRESHOLDS.includes(a))
  )
    return null
  return {
    limitAmount,
    currentSpend: currentSpend ?? 0,
    refreshPeriod: value.refreshPeriod as VercelKeyBudgetInput["refreshPeriod"],
    alertThresholds: alerts,
    active: value.active !== false,
    archived: value.archived === true,
    ...(typeof value.includeByokInQuota === "boolean"
      ? { includeByokInQuota: value.includeByokInQuota }
      : {}),
  }
}

/** PATCH is also the native removal operation (`archived:true`). */
export async function updateVercelKeyBudget(
  request: ApiServiceRequest,
  teamId: string,
  id: string,
  patch: Partial<VercelKeyBudgetInput> & { archived?: boolean },
  options?: { signal?: AbortSignal },
) {
  const body = await vercelRequests.payload<unknown>(
    { ...createVercelAccountRequest(request), abortSignal: options?.signal },
    {
      endpoint: withVercelQuery(
        `${VERCEL_ACCOUNT_ENDPOINTS.ApiKeys}/${encodeURIComponent(id)}/quota`,
        { [VERCEL_TEAM_ID_QUERY_PARAM]: teamId },
      ),
      options: {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  notifyApiTransportObserver(request.observer, "onMutationAccepted")
  if (!isRecord(body)) throw new Error("vercel_budget_update_unreadable")
  return body
}
