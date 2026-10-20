import type { UsageHistoryCapability } from "~/services/apiAdapters/contracts/usageHistory"
import { fetchRelayForUsagePage } from "~/services/apiService/relayfor"
import { isRecord } from "~/services/apiService/relayfor/parsing"
import {
  LogType,
  type LogItem,
} from "~/services/history/usageHistory/usageLogModel"
import { normalizeToMs } from "~/utils/core/formatters"

export const relayForUsageHistory: UsageHistoryCapability = {
  async fetchPage(request, query) {
    const data = await fetchRelayForUsagePage(request, query)
    if (
      !isRecord(data) ||
      !Array.isArray(data.items) ||
      !Number.isInteger(data.total_pages) ||
      Number(data.total_pages) < 0
    )
      throw new Error("Invalid RelayFor usage page")
    const items = data.items.map((item): LogItem => {
      if (
        !isRecord(item) ||
        typeof item.id !== "number" ||
        !Number.isFinite(item.id) ||
        typeof item.model !== "string" ||
        typeof item.quota !== "number" ||
        !Number.isFinite(item.quota)
      )
        throw new Error("Invalid RelayFor usage record")
      const timestamp = normalizeToMs(item.created_at as string | number)
      if (!timestamp || !Number.isFinite(timestamp))
        throw new Error("Invalid RelayFor usage timestamp")
      const number = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value) ? value : 0
      const detail = isRecord(item.billing_detail) ? item.billing_detail : {}
      return {
        id: item.id,
        user_id: Number(request.auth?.userId) || 0,
        created_at: Math.floor(timestamp / 1000),
        type: LogType.Consume,
        content: typeof item.error_code === "string" ? item.error_code : "",
        username: "",
        token_name: typeof item.token_name === "string" ? item.token_name : "",
        model_name: item.model,
        quota: Math.max(0, item.quota - number(detail.refund_quota)),
        prompt_tokens: number(item.prompt_tokens),
        completion_tokens: number(item.completion_tokens),
        use_time:
          typeof item.duration_ms === "number" &&
          Number.isFinite(item.duration_ms) &&
          item.duration_ms >= 0
            ? item.duration_ms / 1000
            : -1,
        is_stream: item.is_stream === true,
        channel_id: 0,
        channel_name: "",
        token_id: number(item.token_id),
        group: typeof item.quota_group === "string" ? item.quota_group : "",
        ip: "",
        other: JSON.stringify({
          ...detail,
          cached_tokens: number(item.cached_tokens),
          cache_write_tokens: number(item.cache_write_tokens),
          status_code: item.status_code,
        }),
      }
    })
    return {
      items,
      total:
        typeof data.total === "number"
          ? data.total
          : Number(data.total_pages) * query.pageSize,
    }
  },
}
