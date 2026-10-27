import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { fetchNovitaBalanceDetail } from "~/services/apiService/novita"
import type { NovitaBalanceDetail } from "~/services/apiService/novita/parsing"
import { SiteHealthStatus } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("ApiService.Novita")

/**
 * Preserve the upstream `availableBalance` (console "Credits Remaining")
 * rather than deriving it from the components. Cash is remaining top-up funds;
 * the credit limit is the maximum debt allowed, not purchased balance.
 */
function toNativeBalance(balance: NovitaBalanceDetail) {
  return {
    unit: "USD" as const,
    total: balance.availableUsd,
    permanent: balance.cashUsd,
    daily: 0,
    components: [
      { kind: "permanent" as const, amount: balance.cashUsd },
      ...(balance.creditLimitUsd > 0
        ? [
            {
              kind: "permanent" as const,
              name: "Credit limit",
              amount: balance.creditLimitUsd,
            },
          ]
        : []),
    ],
  }
}

/** Fetches and normalizes the Novita account balance. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const balance = await fetchNovitaBalanceDetail(request)

  return {
    quota: balance.availableUsd * QUOTA_PER_USD,
    nativeBalance: toNativeBalance(balance),
    // The day-cycle billing route's non-empty shape is unverified, and the
    // monthly-consume route needs the console session; no "today" window is
    // advertised for the extension's own day.
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
    checkIn: request.checkIn,
  }
}

/** Refreshes the Novita balance and maps failures to account health. */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchAccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    logger.error("Failed to refresh Novita account data")
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}
