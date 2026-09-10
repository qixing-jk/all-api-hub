import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import {
  fetchVoApiV2CheckInStats,
  submitVoApiV2CheckIn,
} from "~/services/apiService/voapiV2"
import { isVoApiV2AuthExpiredError } from "~/services/apiService/voapiV2/parsing"
import { resyncVoApiV2AuthToken } from "~/services/apiService/voapiV2/tokenResync"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
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
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: AutoCheckinProviderContext["protectionBypassExecution"],
  mutationLifecycle?: AutoCheckinProviderContext["mutationLifecycle"],
): ApiServiceRequest => ({
  baseUrl: account.site_url,
  accountId: account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: account.account_info.access_token,
    userId: account.account_info.id,
  },
  ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
  ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
  ...(mutationLifecycle ? { observer: mutationLifecycle } : {}),
})

const isVoApiV2Account = (account: SiteAccount): boolean =>
  account.site_type === SITE_TYPES.VO_API_V2

// https://github.com/VoAPI/VoAPI — the stats endpoint is read-only; the
// separate submit endpoint remains exclusive to checkIn execution.

const updateAccountAuthFromResync = async (
  account: SiteAccount,
  authUpdate: {
    accessToken: string
    userId: string
    username?: string
  },
) => {
  await accountMutations.updateAccount(
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
  const signed = stats.todaySigned === true

  if ("alreadySigned" in submitResult) {
    return {
      status: signed
        ? CHECKIN_RESULT_STATUS.ALREADY_CHECKED
        : CHECKIN_RESULT_STATUS.FAILED,
      messageKey: signed
        ? AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: stats,
    }
  }

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

const getStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async ({
  account,
  request,
  observedAt,
  signal,
}) => {
  const statusRequest =
    request ?? (account ? createRequest(account, undefined) : undefined)
  if (!statusRequest) return undefined
  const composedSignal = composeAbortSignals([
    statusRequest.abortSignal,
    signal,
  ])
  let stats: Awaited<ReturnType<typeof fetchVoApiV2CheckInStats>>
  try {
    stats = await fetchVoApiV2CheckInStats({
      ...statusRequest,
      ...(composedSignal.signal ? { abortSignal: composedSignal.signal } : {}),
    })
  } finally {
    composedSignal.dispose()
  }
  if (typeof stats.todaySigned !== "boolean") return undefined
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    today: stats.todaySigned
      ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
      : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }
}

export const voApiV2Provider: AutoCheckinProvider = {
  getReadiness(account) {
    if (!isVoApiV2Account(account)) {
      return {
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      }
    }
    return account.account_info?.access_token
      ? { ready: true }
      : {
          ready: false,
          reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
        }
  },
  detect: (context) => detectWithStatusReadback(context, getStatus),
  getStatus,
  async checkIn(
    account,
    context: AutoCheckinProviderContext,
  ): Promise<AutoCheckinProviderResult> {
    const tempWindowRequestSource = normalizeTempWindowRequestSource(
      context.tempWindowRequestSource,
    )
    try {
      const siteAccount = account as SiteAccount
      const request = createRequest(
        siteAccount,
        tempWindowRequestSource,
        context.protectionBypassExecution,
        context.mutationLifecycle,
      )
      try {
        return await runCheckIn(request)
      } catch (error) {
        if (!isVoApiV2AuthExpiredError(error)) {
          throw error
        }

        // The authoritative 401 proves the first POST was not applied. Clear
        // its lifecycle before any read-only recovery work can fail.
        if (context.mutationLifecycle) {
          context.mutationLifecycle.dispatched = false
          context.mutationLifecycle.responseReceived = false
        }

        const resynced = await resyncVoApiV2AuthToken(
          siteAccount.site_url,
          tempWindowRequestSource,
          context.protectionBypassExecution,
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
      return resolveProviderErrorResult({
        error,
        mutationDispatched: context.mutationLifecycle?.dispatched,
      })
    }
  },
}
