import { UI_CONSTANTS } from "~/constants/ui"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { createPersistedSiteAccount } from "~/services/accounts/accountDefaults"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { SiteHealthStatus } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

/** Builds the canonical transient account/request used by dialog redetection. */
function createAccountDialogCheckInDiscoveryContext(params: {
  draft: AccountDialogDraft
  url: string
  accountId?: string
  tempWindowRequestSource: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
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
      exchange_rate:
        Number(draft.exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
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
  const request: ApiServiceRequest = {
    baseUrl: params.url,
    accountId: account.id,
    ...(cookieAuthSessionCookie ? { cookieAuthSessionCookie } : {}),
    auth: {
      authType: draft.authType,
      userId: draft.userId.trim(),
      accessToken: draft.accessToken.trim(),
    },
    tempWindowRequestSource: params.tempWindowRequestSource,
    protectionBypassExecution: params.protectionBypassExecution,
  }

  return { account, request }
}

/** Runs the dialog's provider discovery in the existing read-only bypass flow. */
export function discoverAccountDialogCheckInMethods(params: {
  draft: AccountDialogDraft
  url: string
  accountId?: string
  tempWindowRequestSource: TempWindowRequestSource
}) {
  return withProtectionBypassUserCommand(
    PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
    params.tempWindowRequestSource,
    (protectionBypassExecution) => {
      const context = createAccountDialogCheckInDiscoveryContext({
        ...params,
        protectionBypassExecution,
      })
      return discoverCheckInMethods({
        account: context.account,
        config: params.draft.checkIn,
        request: context.request,
      })
    },
  )
}
