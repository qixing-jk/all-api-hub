import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { createPersistedSiteAccount } from "~/services/accounts/editing/accountDefaults"
import { discoverAccountCheckInMethods } from "~/services/checkin/autoCheckin/discovery/accountDiscovery"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { SiteHealthStatus } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

/** Builds the canonical transient account from the current editor draft. */
function createAccountDialogCheckInDiscoveryAccount(params: {
  draft: AccountDialogDraft
  url: string
  accountId?: string
}) {
  const { draft } = params
  const cookieAuthSessionCookie = draft.cookieAuthSessionCookie.trim()
  const account = createPersistedSiteAccount({
    id: params.accountId ?? "account-dialog-check-in-discovery",
    now: Date.now(),
    account: {
      site_name: draft.siteName.trim(),
      site_url: params.url,
      site_type: draft.siteType,
      exchange_rate: Number(draft.exchangeRate) || DEFAULT_USD_TO_CNY_RATE,
      account_info: {
        id: draft.userId.trim(),
        access_token: draft.accessToken.trim(),
        username: draft.username.trim(),
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      health: { status: SiteHealthStatus.Unknown },
      last_sync_time: 0,
      notes: draft.notes,
      tagIds: draft.tagIds,
      disabled: false,
      excludeFromTotalBalance: draft.excludeFromTotalBalance,
      excludeFromTodayIncome: draft.excludeFromTodayIncome,
      authType: draft.authType,
      ...(cookieAuthSessionCookie
        ? { cookieAuth: { sessionCookie: cookieAuthSessionCookie } }
        : {}),
      checkIn: draft.checkIn,
    },
  })
  return account
}

/**
 * Runs the dialog's provider discovery in the existing read-only bypass flow and
 * reports the context it ran under, so a probe in the same click shares it instead
 * of reading the site without one.
 */
export function discoverAccountDialogCheckInMethods(params: {
  draft: AccountDialogDraft
  url: string
  accountId?: string
  tempWindowRequestSource: TempWindowRequestSource
}): Promise<{
  discovery: Awaited<ReturnType<typeof discoverAccountCheckInMethods>>
  protectionBypassExecution: ProtectionBypassExecution
}> {
  return withProtectionBypassUserCommand(
    PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
    params.tempWindowRequestSource,
    async (protectionBypassExecution) => {
      const account = createAccountDialogCheckInDiscoveryAccount(params)
      const discovery = await discoverAccountCheckInMethods(account, {
        tempWindowRequestSource: params.tempWindowRequestSource,
        protectionBypassExecution,
      })

      return { discovery, protectionBypassExecution }
    },
  )
}
