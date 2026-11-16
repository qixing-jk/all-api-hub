import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { AccountUpdateUserTimestampMode } from "~/services/accounts/editing/accountDefaults"
import {
  fetchVoApiV2CheckInStats,
  submitVoApiV2CheckIn,
} from "~/services/apiService/voapiV2/checkIn"
import { isVoApiV2AuthExpiredError } from "~/services/apiService/voapiV2/parsing"
import { resyncVoApiV2AuthToken } from "~/services/apiService/voapiV2/tokenResync"
import type { VoApiV2CheckInStats } from "~/services/apiService/voapiV2/type"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  createUnconfirmedCheckInResult,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import {
  createTerminalFailureResult,
  createUpstreamFailureResult,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import { createConfirmedCheckInResult } from "~/services/checkin/autoCheckin/resultReconciliation"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

const createRequest = (
  account: SiteAccount,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: AutoCheckinProviderContext["protectionBypassExecution"],
  mutationLifecycle?: AutoCheckinProviderContext["mutationLifecycle"],
): ApiServiceRequest =>
  bindApiTransportRequest(
    {
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
    },
    API_DIRECT_REQUEST_REASONS.CallerManaged,
  )

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
  account: SiteAccount,
  request: ApiServiceRequest,
  mutationLifecycle?: AutoCheckinProviderContext["mutationLifecycle"],
): Promise<AutoCheckinProviderOutcome> => {
  const submitResult = await submitVoApiV2CheckIn(request)
  let observation: Awaited<
    ReturnType<typeof readDayStableCheckInObservation<VoApiV2CheckInStats>>
  >
  try {
    observation = await readDayStableCheckInObservation(() =>
      fetchVoApiV2CheckInStats(request),
    )
  } catch (error) {
    // Only a submit refusal may admit another POST; a read refusal cannot undo it.
    return withCheckInConfirmation(
      account,
      resolveProviderErrorResult({
        error,
        mutationDispatched: mutationLifecycle?.dispatched,
      }),
      { kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable },
    )
  }
  const stats = observation?.observation
  const status =
    stats && observation
      ? toVoApiV2MethodStatus(stats, observation.observedAt)
      : undefined
  if (!status) {
    return createUnconfirmedCheckInResult(account, { data: stats })
  }
  const result =
    stats?.todaySigned === true
      ? createConfirmedCheckInResult({
          status:
            "alreadySigned" in submitResult
              ? CHECKIN_RESULT_STATUS.ALREADY_CHECKED
              : CHECKIN_RESULT_STATUS.SUCCESS,
          data: stats,
        })
      : createUpstreamFailureResult({ data: stats })
  return withCheckInConfirmation(account, result, {
    kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
    status,
  })
}

/** A stats reply is observation evidence, including a post-submit repeat candidate. */
function toVoApiV2MethodStatus(
  stats: VoApiV2CheckInStats,
  observedAt: number,
): CheckInMethodStatus | undefined {
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
  let stats: VoApiV2CheckInStats
  try {
    stats = await fetchVoApiV2CheckInStats({
      ...statusRequest,
      ...(composedSignal.signal ? { abortSignal: composedSignal.signal } : {}),
    })
  } finally {
    composedSignal.dispose()
  }
  return toVoApiV2MethodStatus(stats, observedAt)
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
  ): Promise<AutoCheckinProviderOutcome> {
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
        return await runCheckIn(siteAccount, request, context.mutationLifecycle)
      } catch (error) {
        if (!isVoApiV2AuthExpiredError(error)) {
          throw error
        }

        // The provider's recognized auth-expired refusal proves the first POST
        // was not applied. Clear its lifecycle before read-only recovery can fail.
        if (context.mutationLifecycle) {
          context.mutationLifecycle.dispatched = false
          context.mutationLifecycle.responseReceived = false
        }

        const resynced = await resyncVoApiV2AuthToken(
          siteAccount.site_url,
          tempWindowRequestSource,
          context.protectionBypassExecution,
          siteAccount.account_info.id,
        )
        if (
          !resynced ||
          resynced.userId !== String(siteAccount.account_info.id)
        ) {
          return withCheckInConfirmation(
            siteAccount,
            createTerminalFailureResult({
              reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
              rawMessage: error.message,
            }),
            { kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable },
          )
        }

        await updateAccountAuthFromResync(siteAccount, resynced)

        return await runCheckIn(
          siteAccount,
          {
            ...request,
            auth: {
              ...request.auth,
              accessToken: resynced.accessToken,
              userId: resynced.userId,
            },
          },
          context.mutationLifecycle,
        )
      }
    } catch (error) {
      return resolveProviderErrorResult({
        error,
        mutationDispatched: context.mutationLifecycle?.dispatched,
      })
    }
  },
}
