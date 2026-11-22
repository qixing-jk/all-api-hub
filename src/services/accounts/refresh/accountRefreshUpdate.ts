import type {
  AccountData,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { normalizeAccountSiteSupplementalAuth } from "~/services/accounts/accountSiteProfile/supplementalAuth"
import {
  migrateAccountFinancialInfo,
  type LegacyAccountFinancialEvidence,
} from "~/services/accounts/migrations/accountFinancialMigration"
import { ACCOUNT_TODAY_METRIC_STATUSES, type SiteAccount } from "~/types"
import type { DeepPartial } from "~/types/utils"

/** Preserve data from adapters still returning the release wire format. */
function readLegacyAdapterFinancialPatch(
  data: AccountData,
  context: Parameters<typeof migrateAccountFinancialInfo>[1],
  previous: LegacyAccountFinancialEvidence | undefined,
) {
  if (
    data.balance !== undefined ||
    data.balanceRefreshParts !== undefined ||
    (data.quota === undefined &&
      data.nativeBalance === undefined &&
      data.balanceUnavailable === undefined)
  )
    return {}
  const { balance } = migrateAccountFinancialInfo(
    {
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      id: "",
      username: "",
      access_token: "",
      ...(data.quota === undefined ? {} : { quota: data.quota }),
      ...(data.nativeBalance === undefined
        ? {}
        : { nativeBalance: data.nativeBalance }),
      ...(data.balanceUnavailable === undefined
        ? {}
        : { balanceUnavailable: data.balanceUnavailable }),
    },
    context,
  )
  const fields = [
    ["consumption", data.today_quota_consumption],
    ["income", data.today_income],
  ] as const
  const fresh = fields.filter(
    ([metric, value]) =>
      data.todayStatsAvailability?.[metric]?.status ===
        ACCOUNT_TODAY_METRIC_STATUSES.Complete &&
      typeof value === "number" &&
      Number.isFinite(value),
  )
  if (!fresh.length) return { balance }
  const accepted = previous?.identityInvalidated ? undefined : previous
  return {
    balance,
    legacyFinancial: {
      schemaVersion: 1 as const,
      capturedAt: context.capturedAt,
      ...previous,
      identityInvalidated: previous?.identityInvalidated ? false : undefined,
      cashflow: { ...accepted?.cashflow, ...Object.fromEntries(fresh) },
      cashflowCapturedAt: {
        ...accepted?.cashflowCapturedAt,
        ...Object.fromEntries(
          fresh.map(([metric]) => [metric, context.capturedAt]),
        ),
      },
    },
  }
}

/** Projects adapter data into a refresh patch without writing stored account state. */
export function buildAccountRefreshUpdate(
  account: SiteAccount,
  result: RefreshAccountResult,
  reEnableOnSuccess: boolean,
): DeepPartial<SiteAccount> {
  const capturedAt = Date.now()
  const updateData: DeepPartial<SiteAccount> = {
    health: {
      status: result.healthStatus.status,
      reason: result.healthStatus.message,
      code: result.healthStatus.code,
    },
    last_sync_time: capturedAt,
  }
  if (!result.success) return updateData

  updateData.account_info = {
    settledConsumption: result.data.settledConsumption,
    reportedIncome: result.data.reportedIncome,
    balance: result.data.balance,
    allowances: result.data.allowances,
    today_prompt_tokens: result.data.today_prompt_tokens,
    today_completion_tokens: result.data.today_completion_tokens,
    today_quota_consumption: result.data.today_quota_consumption,
    today_requests_count: result.data.today_requests_count,
    today_income: result.data.today_income,
    todayStatsAvailability: result.data.todayStatsAvailability,
    usage: result.data.usage,
    usageObservations: result.data.usageObservations,
    subscription: result.data.subscription,
    recentUsageRecords: result.data.recentUsageRecords,
    ...readLegacyAdapterFinancialPatch(
      result.data,
      {
        accountId: account.id,
        siteUrl: account.site_url,
        siteType: account.site_type,
        capturedAt,
      },
      account.account_info.legacyFinancial,
    ),
  }
  if (reEnableOnSuccess) updateData.disabled = false

  const authUpdate = result.authUpdate
  if (authUpdate) {
    updateData.account_info = {
      ...updateData.account_info,
      ...(typeof authUpdate.accessToken === "string" &&
      authUpdate.accessToken.trim()
        ? { access_token: authUpdate.accessToken.trim() }
        : {}),
      ...(typeof authUpdate.userId === "string" && authUpdate.userId.trim()
        ? { id: authUpdate.userId.trim() }
        : {}),
      ...(typeof authUpdate.username === "string" && authUpdate.username.trim()
        ? { username: authUpdate.username.trim() }
        : {}),
    }
    const supplementalAuth = normalizeAccountSiteSupplementalAuth({
      siteType: account.site_type,
      sub2apiAuth: authUpdate.sub2apiAuth,
    })
    if (supplementalAuth.sub2apiAuth) {
      updateData.sub2apiAuth = supplementalAuth.sub2apiAuth
    }
    if (authUpdate.kimiOpenPlatformAuth) {
      updateData.kimiOpenPlatformAuth = authUpdate.kimiOpenPlatformAuth
    }
  }

  return updateData
}
