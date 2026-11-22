import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { observeAmount } from "~/services/amounts/balance"
import { parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_FUNDING,
  BALANCE_NATURES,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"

import { EMRANK_ENDPOINTS, EMRANK_TOKEN_ASSET } from "./constants"
import { fetchEmRankIdentity } from "./identity"
import { readEmRank, withEmRankSession } from "./transport"

/** Preserves signed atomic Token balances without inventing a cash conversion. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    const endpoint = EMRANK_ENDPOINTS.Account
    const body = await readEmRank(scoped, endpoint)
    const parsed = parseDecimal(body.quota)
    const tokens =
      parsed !== undefined && /^-?\d+$/.test(parsed) ? parsed : undefined
    const scope = accountBalanceScope(request)
    const capturedAt = Date.now()
    return {
      ...accountBalanceObservation(
        scope,
        [
          {
            id: "balance",
            collectionKey: "account",
            scope,
            role: BALANCE_ROLES.Available,
            nature: BALANCE_NATURES.Prepaid,
            funding: BALANCE_FUNDING.Unknown,
            cashClassification: BALANCE_CASH_CLASSIFICATIONS.NotCash,
            asset: { kind: ASSET_KINDS.Quota, ...EMRANK_TOKEN_ASSET },
            amount: observeAmount(
              tokens,
              {
                adapter: "emrank",
                contractVersion: "1",
                operation: endpoint,
                kind: EVIDENCE_KINDS.Reported,
                inputs: ["quota"],
              },
              capturedAt,
            ),
            validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
          },
        ],
        capturedAt,
        FINANCIAL_ENUMERATION.Complete,
      ),
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
