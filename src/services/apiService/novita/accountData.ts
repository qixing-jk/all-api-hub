import { CURRENCIES } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import {
  balancePosition,
  type BalancePosition,
} from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_NATURES,
  BALANCE_ROLES,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import { fetchNovitaBalanceDetail } from "~/services/apiService/novita"
import { SiteHealthStatus } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("ApiService.Novita")

/** Fetches and normalizes the Novita account balance. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const balance = await fetchNovitaBalanceDetail(request)
  const scope = accountBalanceScope(request)
  const capturedAt = Date.now()
  const position = (
    id: string,
    role: BalancePosition["role"],
    value: unknown,
    field: string,
  ) =>
    balancePosition({
      id,
      role,
      scope,
      value,
      observedAt: capturedAt,
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      source: {
        adapter: "novita",
        operation: "/v1/billing/balance/detail",
        contractVersion: "2",
        kind: EVIDENCE_KINDS.Reported,
        inputs: [field],
      },
    })

  return {
    ...accountBalanceObservation(
      scope,
      [
        {
          ...position(
            "available",
            BALANCE_ROLES.Available,
            balance.amounts.available,
            "availableBalance",
          ),
          nature: BALANCE_NATURES.Mixed,
        },
        {
          ...position(
            "cash",
            BALANCE_ROLES.Ledger,
            balance.amounts.cash,
            "cashBalance",
          ),
          nature: BALANCE_NATURES.Prepaid,
          cashClassification: BALANCE_CASH_CLASSIFICATIONS.ReportedCash,
        },
        {
          ...position(
            "credit-limit",
            BALANCE_ROLES.CreditLimit,
            balance.amounts.creditLimit,
            "creditLimit",
          ),
          nature: BALANCE_NATURES.Credit,
          cashClassification: BALANCE_CASH_CLASSIFICATIONS.NotCash,
        },
        position(
          "pending",
          BALANCE_ROLES.PendingCharge,
          balance.amounts.pending,
          "pendingCharges",
        ),
        position(
          "debt",
          BALANCE_ROLES.Debt,
          balance.amounts.debt,
          "outstandingInvoices",
        ),
      ],
      capturedAt,
      FINANCIAL_ENUMERATION.Complete,
    ),
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
