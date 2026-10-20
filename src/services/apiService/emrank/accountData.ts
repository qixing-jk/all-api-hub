import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"

import { EMRANK_ENDPOINTS, EMRANK_TOKEN_ASSET } from "./constants"
import { fetchEmRankIdentity } from "./identity"
import {
  invalidEmRankResponse,
  readEmRank,
  withEmRankSession,
} from "./transport"

/** Preserves signed atomic Token balances without inventing a cash conversion. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    const endpoint = EMRANK_ENDPOINTS.Account
    const body = await readEmRank(scoped, endpoint)
    if (body.quota === undefined || body.quota === null)
      invalidEmRankResponse(endpoint)
    const tokens =
      typeof body.quota === "number"
        ? body.quota
        : typeof body.quota === "string" &&
            /^-?\d{1,16}$/.test(body.quota.trim())
          ? Number(body.quota)
          : Number.NaN
    if (!Number.isSafeInteger(tokens)) invalidEmRankResponse(endpoint)
    return {
      // Money totals must not absorb credit the site never prices in dollars.
      quota: 0,
      nativeBalance: {
        unit: "quota",
        asset: EMRANK_TOKEN_ASSET,
        total: tokens,
      },
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      // The console has no verified "today" window contract for the
      // extension's own day; a rolling counter must not be relabelled.
      todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
      checkIn: request.checkIn,
    }
  })
}
