import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import type { AccountAllowanceSnapshot } from "~/services/accounts/allowances"
import type { BalanceSnapshot } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import type { FinancialIncomeFact } from "~/services/amounts/income"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import type { AccountUsageSummary } from "~/types"
import type {
  BalanceHistoryPreferences,
  DailyBalanceHistoryCaptureSource,
} from "~/types/dailyBalanceHistory"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { dailyBalanceHistoryStorage } from "./storage"

const logger = createLogger("DailyBalanceHistoryCapture")

/** Append accepted native observations; old quota records remain read-only. */
export async function maybeCaptureDailyBalanceSnapshot(params: {
  config?: BalanceHistoryPreferences
  accountId: string
  generation?: number
  balance?: BalanceSnapshot
  allowances?: AccountAllowanceSnapshot
  settledConsumption?: FinancialConsumptionFact[]
  usage?: AccountUsageSummary[]
  reportedIncome?: FinancialIncomeFact[]
  source: DailyBalanceHistoryCaptureSource
  timeZone?: string
}): Promise<boolean> {
  const config = params.config ?? DEFAULT_BALANCE_HISTORY_PREFERENCES
  const reportedDayCosts = (params.usage ?? []).flatMap(
    ({ scope, cost, reportedDay }) => {
      if (
        (scope !== ACCOUNT_USAGE_SCOPES.Today &&
          scope !== ACCOUNT_USAGE_SCOPES.SiteToday) ||
        !cost?.scope ||
        cost.amount.status !== OBSERVATION_STATUSES.Known ||
        cost.asset.kind === ASSET_KINDS.Unknown
      )
        return []
      const dayKey =
        reportedDay ??
        (cost.window
          ? getDayKeyFromUnixSeconds(
              cost.window.start / 1000,
              cost.window.timeZone,
            )
          : undefined)
      return [
        {
          ...cost,
          scope: cost.scope,
          ...(dayKey ? { dayKey } : {}),
        },
      ]
    },
  )
  if (
    !config.enabled ||
    (!params.balance &&
      !params.allowances &&
      !params.settledConsumption?.length &&
      !reportedDayCosts.length &&
      !params.reportedIncome?.length)
  )
    return false

  try {
    return await dailyBalanceHistoryStorage.appendFinancialSnapshot({
      accountId: params.accountId,
      snapshot: {
        generation: params.generation,
        balance: params.balance,
        allowances: params.allowances,
        settledConsumption: params.settledConsumption,
        ...(reportedDayCosts.length ? { reportedDayCosts } : {}),
        reportedIncome: params.reportedIncome,
        source: params.source,
      },
      retentionDays: config.retentionDays,
      timeZone: params.timeZone,
    })
  } catch (error) {
    logger.error("Failed to append financial history", {
      accountId: params.accountId,
      error: getErrorMessage(error),
    })
    return false
  }
}
