import { SITE_TYPES } from "~/constants/siteType"
import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  fetchVoApiV2CheckInStats,
  submitVoApiV2CheckIn,
} from "~/services/apiService/voapiV2"
import { isVoApiV2AuthExpiredError } from "~/services/apiService/voapiV2/parsing"
import { resyncVoApiV2AuthToken } from "~/services/apiService/voapiV2/tokenResync"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

const createRequest = (
  account: SiteAccount,
  tempWindowRequestSource: TempWindowRequestSource,
): ApiServiceRequest => ({
  baseUrl: account.site_url,
  accountId: account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: account.account_info.access_token,
    userId: account.account_info.id,
  },
  tempWindowRequestSource,
})

const isVoApiV2Account = (account: SiteAccount): boolean =>
  account.site_type === SITE_TYPES.VO_API_V2

const updateAccountAuthFromResync = async (
  account: SiteAccount,
  authUpdate: {
    accessToken: string
    userId: string
    username?: string
  },
) => {
  await accountStorage.updateAccount(
    account.id,
    {
      account_info: {
        ...account.account_info,
        access_token: authUpdate.accessToken,
        id: authUpdate.userId,
        ...(authUpdate.username ? { username: authUpdate.username } : {}),
      },
    },
    {
      userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
    },
  )
}

const runCheckIn = async (
  request: ApiServiceRequest,
): Promise<AutoCheckinProviderResult> => {
  const submitResult = await submitVoApiV2CheckIn(request)
  const stats = await fetchVoApiV2CheckInStats(request)

  if ("alreadySigned" in submitResult) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
      data: stats,
    }
  }

  const signed = stats.todaySigned === true

  return {
    status: signed
      ? CHECKIN_RESULT_STATUS.SUCCESS
      : CHECKIN_RESULT_STATUS.FAILED,
    messageKey: signed
      ? AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful
      : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
    data: stats,
  }
}

export const voApiV2Provider: AutoCheckinProvider = {
  canCheckIn(account) {
    return Boolean(
      isVoApiV2Account(account) &&
        account.checkIn?.enableDetection &&
        account.checkIn?.autoCheckInEnabled !== false &&
        account.account_info?.access_token,
    )
  },
  async checkIn(
    account,
    context?: AutoCheckinProviderContext,
  ): Promise<AutoCheckinProviderResult> {
    const tempWindowRequestSource = normalizeTempWindowRequestSource(
      context?.tempWindowRequestSource,
    )
    try {
      if (!this.canCheckIn(account as SiteAccount)) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
        }
      }

      const siteAccount = account as SiteAccount
      const request = createRequest(siteAccount, tempWindowRequestSource)
      try {
        return await runCheckIn(request)
      } catch (error) {
        if (!isVoApiV2AuthExpiredError(error)) {
          throw error
        }

        const resynced = await resyncVoApiV2AuthToken(
          siteAccount.site_url,
          tempWindowRequestSource,
        )
        if (!resynced) {
          throw error
        }

        await updateAccountAuthFromResync(siteAccount, resynced)

        return await runCheckIn({
          ...request,
          auth: {
            ...request.auth,
            accessToken: resynced.accessToken,
            userId: resynced.userId,
          },
        })
      }
    } catch (error) {
      return resolveProviderErrorResult({ error })
    }
  },
}
