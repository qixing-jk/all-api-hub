import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { LogResponseData } from "~/services/history/usageHistory/usageLogModel"

export type UsageHistoryPageQuery = {
  page: number
  pageSize: number
  /** Unix seconds, as used by the shared history cursor. */
  startTimestamp: number
  endTimestamp: number
}

/** Provider-owned log transport; shared ingestion owns retention and pagination. */
export type UsageHistoryCapability = {
  fetchPage(
    request: ApiServiceRequest,
    query: UsageHistoryPageQuery,
  ): Promise<LogResponseData>
}
