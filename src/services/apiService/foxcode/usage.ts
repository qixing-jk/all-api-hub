import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { AccountUsageRecord } from "~/types"
import { isRecord } from "~/utils/core/object"

import { FOXCODE_UNITS_PER_USD } from "./constants"
import { invalidFoxCodeResponse, readFoxCode } from "./transport"

/** The website's recent-record window is not an all-time or calendar-today summary. */
export async function fetchRecentUsage(
  request: ApiServiceRequest,
): Promise<AccountUsageRecord[]> {
  const endpoint = "/api/user/quota/usage?page=1&limit=20&includeTotal=0"
  const data = await readFoxCode(request, endpoint)
  if (!Array.isArray(data.records)) throw invalidFoxCodeResponse(endpoint)
  return data.records.map((record) => {
    if (
      !isRecord(record) ||
      typeof record.createdAt !== "string" ||
      !Number.isFinite(Date.parse(record.createdAt)) ||
      typeof record.model !== "string"
    )
      throw invalidFoxCodeResponse(endpoint)
    const costDetails = isRecord(record.costDetails) ? record.costDetails : {}
    const perCall =
      isRecord(costDetails.pricing) && costDetails.pricing.Times === true
    const optional = (field: string) => {
      const value = record[field]
      return typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0
        ? value
        : undefined
    }
    const breakdown = isRecord(costDetails.breakdown)
      ? costDetails.breakdown
      : {}
    const cost =
      typeof breakdown.baseCost === "number" &&
      Number.isFinite(breakdown.baseCost) &&
      breakdown.baseCost >= 0
        ? breakdown.baseCost / FOXCODE_UNITS_PER_USD
        : undefined
    return {
      requestTime: record.createdAt,
      model: record.model,
      ...(!perCall
        ? {
            inputTokens: optional("inputTokens"),
            outputTokens: optional("outputTokens"),
            cacheCreationTokens: optional("cacheCreationInputTokens"),
            cacheReadTokens: optional("cacheReadInputTokens"),
            totalTokens: optional("totalTokens"),
          }
        : {}),
      ...(cost !== undefined ? { cost } : {}),
    }
  })
}
