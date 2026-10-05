import {
  createApiToken as createFamilyToken,
  fetchTokenById as fetchFamilyTokenById,
  fetchAccountTokens as fetchFamilyTokens,
  updateApiToken as updateFamilyToken,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import type {
  NewApiToken,
  NewApiTokenWrite,
} from "~/services/apiService/newApiFamily/tokenTypes"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { TodayLogQueryConfig } from "~/services/history/usageHistory/usageLogModel"

/** Project restrictions from native fields rather than empty compatibility aliases. */
function normalizeToken(token: NewApiToken): NewApiToken {
  // Live v31.1.5 GET /api/token/:id returns empty model_limits/allow_ips even
  // when models/ip_whitelist are configured: https://api2.laozhang.ai/token
  const native = token as NewApiToken & { ip_whitelist?: unknown }
  if (
    typeof native.models !== "string" ||
    typeof native.ip_whitelist !== "string"
  ) {
    throw new TypeError("Invalid LaoZhang token restrictions")
  }
  return {
    ...token,
    model_limits_enabled: !!native.models.trim(),
    model_limits: native.models,
    allow_ips: native.ip_whitelist,
  }
}

/** Read every native zero-based inventory page and normalize its restrictions. */
export async function fetchAccountTokens(request: ApiServiceRequest) {
  return (
    await fetchFamilyTokens(request, {
      startPage: 0,
      pageSizeParamName: "pageSize",
    })
  ).map(normalizeToken)
}

/** Read a fresh editable token including its native restriction fields. */
export async function fetchTokenById(request: ApiServiceRequest, id: number) {
  return normalizeToken(await fetchFamilyTokenById(request, id))
}

/** Map the canonical editor fields to the native LaoZhang token form. */
function toNativeTokenWrite(values: NewApiTokenWrite) {
  // https://api2.laozhang.ai/token v31.1.5 sends models/ip_whitelist, not
  // the compatibility aliases returned in its response. Keep extra settings
  // from the accepted edit projection while applying the requested changes.
  return {
    ...values,
    models: values.model_limits_enabled ? values.model_limits : "",
    ip_whitelist: values.allow_ips,
  }
}

/** Create a token using the site's native writable field names. */
export function createApiToken(
  request: ApiServiceRequest,
  values: NewApiTokenWrite,
) {
  return createFamilyToken(request, toNativeTokenWrite(values))
}

/** Update a token without changing its native restriction semantics. */
export function updateApiToken(
  request: ApiServiceRequest,
  id: number,
  values: NewApiTokenWrite,
) {
  return updateFamilyToken(request, id, toNativeTokenWrite(values))
}

// https://api2.laozhang.ai/log v31.1.5 uses p=0&pageSize and bare arrays.
// The stat endpoint shares the family's quota envelope; never treat page one
// or a short bare page as a complete collection.
export const LAOZHANG_TODAY_LOG_QUERY_CONFIG: TodayLogQueryConfig = {
  pageIndexOffset: -1,
  pageSizeParamName: "pageSize",
  paginateArraysUntilEmpty: true,
}
