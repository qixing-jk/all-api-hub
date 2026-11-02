import { QUOTA_PER_USD } from "~/constants/money"
import type { UsageHistoryPageQuery } from "~/services/apiAdapters/contracts/usageHistory"
import { AIMLAPI_ENDPOINTS } from "~/services/apiService/aimlapi/constants"
import {
  fetchAimlApiJson,
  invalidAimlApiResponse,
} from "~/services/apiService/aimlapi/transport"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  LogType,
  type LogItem,
  type LogResponseData,
} from "~/services/history/usageHistory/usageLogModel"
import { isRecord } from "~/utils/core/object"

const finiteNonNegative = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined

/**
 * Reads one page of request logs.
 *
 * `/v2/logs` lists failed requests too, with a zero cost; the shared log model
 * keeps them so the history shows what actually happened.
 */
export async function fetchAimlApiKeyUsagePage(
  request: ApiServiceRequest,
  query: UsageHistoryPageQuery,
): Promise<LogResponseData> {
  const endpoint = AIMLAPI_ENDPOINTS.Logs
  const body = await fetchAimlApiJson<unknown>(request, endpoint, {
    credential: "regular-api-key",
    query: {
      start: new Date(query.startTimestamp).toISOString(),
      end: new Date(query.endTimestamp).toISOString(),
      limit: Math.min(Math.max(query.pageSize, 1), 100),
      offset: Math.max((query.page - 1) * query.pageSize, 0),
    },
  })
  if (!isRecord(body) || !Array.isArray(body.data))
    invalidAimlApiResponse(endpoint)

  const items = body.data.map((value, index): LogItem => {
    if (!isRecord(value)) invalidAimlApiResponse(endpoint)
    const createdAt =
      typeof value.created === "string" ? Date.parse(value.created) : NaN
    if (!Number.isFinite(createdAt)) invalidAimlApiResponse(endpoint)
    const cost = isRecord(value.cost) ? value.cost : {}
    const tokens = isRecord(value.tokens) ? value.tokens : {}
    const usd = finiteNonNegative(cost.usd)
    if (usd === undefined) invalidAimlApiResponse(endpoint)
    const status = typeof value.status === "string" ? value.status : ""
    return {
      // The deployment has no numeric log id; the page offset keeps the row
      // stable within one page without inventing a provider identifier.
      id: index + Math.max((query.page - 1) * query.pageSize, 0),
      user_id: Number(request.auth?.userId) || 0,
      created_at: Math.floor(createdAt / 1000),
      type: status === "failed" ? LogType.Error : LogType.Consume,
      content: status,
      username: "",
      token_name:
        typeof value.client_request_id === "string"
          ? value.client_request_id
          : "",
      model_name: typeof value.model === "string" ? value.model : "",
      quota: usd * QUOTA_PER_USD,
      prompt_tokens: finiteNonNegative(tokens.input) ?? 0,
      completion_tokens: finiteNonNegative(tokens.output) ?? 0,
      use_time: -1,
      is_stream: false,
      channel_id: 0,
      channel_name: "",
      token_id: 0,
      group: "",
      ip: "",
      other: JSON.stringify({
        origin: value.origin,
        request_id: value.request_id,
        inference_id: value.inference_id,
        credits: cost.credits,
      }),
    }
  })

  const pagination = isRecord(body.pagination) ? body.pagination : {}
  const total = finiteNonNegative(pagination.total)
  if (total === undefined) invalidAimlApiResponse(endpoint)

  return { items, total }
}
