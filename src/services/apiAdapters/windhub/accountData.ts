import { WINDHUB_ORIGIN } from "~/constants/windhub"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/accountTodayStats"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { readWindhubBrowserStatus } from "~/services/checkin/autoCheckin/providers/windhub"

/** Creates a check-in-only account after verifying its browser identity. */
export const windhubAccountData: AccountDataCapability = {
  async fetchData(request) {
    const userId = normalizeAccountIdentity(request.auth.userId)
    if (
      !userId ||
      new URL(request.baseUrl).origin !== WINDHUB_ORIGIN ||
      (await readWindhubBrowserStatus(userId)).kind !== "status"
    ) {
      throw new Error(
        "Windhub browser session is unavailable or does not match",
      )
    }
    // This integration does not claim to support Windhub balance/usage APIs.
    return {
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
      checkIn: request.checkIn,
    }
  },
}
