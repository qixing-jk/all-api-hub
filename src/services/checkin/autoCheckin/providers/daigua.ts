import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS } from "~/constants/turnstile"
import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import {
  fetchDaiguaDailyCheckInStatus,
  parseDaiguaDailyCheckInMutationResponse,
  performDaiguaDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/daiguaCheckIn"
import { DAIGUA_CHECK_IN_ENDPOINT } from "~/services/apiService/sub2api/checkin/daiguaCheckInProtocol"
import { ApiError } from "~/services/apiTransport/errors"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { tempWindowTurnstileFetch } from "~/utils/browser/tempWindowFetch"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  readUsdReward,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const readStatus = async (context: AutoCheckinProviderReadContext) =>
  toSub2ApiCheckInStatus(
    await fetchDaiguaDailyCheckInStatus(
      createSub2ApiCheckInReadRequest(context),
    ),
    context.observedAt,
  )

const success = (data: { rewardAmount: number }) => ({
  status: CHECKIN_RESULT_STATUS.SUCCESS,
  messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
  reward: readUsdReward(data.rewardAmount),
  data,
})

/** Browser token acquisition belongs to the shared channel; wire facts stay here. */
async function assistTurnstile(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
) {
  const checkInUrl = new URL("/checkin", account.site_url).href
  const manual = () => ({
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
    messageKey: "autoCheckin:providerFallback.turnstileManualRequired",
    messageParams: { checkInUrl },
  })
  if (
    context.beforeRecoveredMutation &&
    !(await context.beforeRecoveredMutation())
  ) {
    return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE)
  }
  // Another native action may have completed the shared ordinary/lucky day.
  const status = await readStatus({ account, observedAt: Date.now() })
  if (status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked) {
    return { status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED }
  }
  if (status.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled)
    return manual()
  const response = await executeAuthenticatedSub2ApiRequest(
    createSub2ApiCheckInMutationRequest(account, context),
    DAIGUA_CHECK_IN_ENDPOINT,
    (authenticatedRequest) =>
      tempWindowTurnstileFetch({
        originUrl: account.site_url,
        pageUrl: checkInUrl,
        fetchUrl: new URL(DAIGUA_CHECK_IN_ENDPOINT, account.site_url).href,
        fetchOptions: {
          method: "POST",
          body: "{}",
          credentials: "omit",
          headers: {
            Authorization: `Bearer ${authenticatedRequest.auth?.accessToken}`,
            "Content-Type": "application/json",
          },
        },
        accountId: account.id,
        authType: AuthTypeEnum.AccessToken,
        responseType: "json",
        turnstileParamName: "turnstile_token",
        turnstileTokenPlacement: "json-body",
        turnstileTimeoutMs: TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS,
        turnstilePreTrigger: {
          kind: "clickSelector",
          selector: '[data-testid="header-normal-checkin"]',
          throttle: { maxAttempts: 1 },
        },
        tempWindowRequestSource: context.tempWindowRequestSource,
        protectionBypassExecution: context.protectionBypassExecution,
      }),
    {
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    },
  )
  if (response.turnstile?.status !== "token_obtained") return manual()
  if (
    !response.success &&
    response.status === 400 &&
    response.error?.toLowerCase().includes("turnstile verification failed")
  )
    return manual()
  const result = parseDaiguaDailyCheckInMutationResponse({
    ok: response.success,
    status: response.status ?? (response.success ? 200 : 500),
    headers: response.headers ?? {},
    body: response.data,
  })
  return success(result)
}

export const daiguaProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getSub2ApiCheckInReadiness,
  detect: (context) => detectWithStatusReadback(context, readStatus),
  getStatus: readStatus,
  async checkIn(account, context) {
    if (
      context.statusProof?.availability !==
        CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      context.statusProof.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }
    try {
      const data = await performDaiguaDailyCheckIn(
        createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
      )
      return success(data)
    } catch (error) {
      // The native verifier posts a body token, unlike New API's query token.
      // An explicit verification rejection is the only safe assisted retry.
      if (
        error instanceof ApiError &&
        error.upstreamCode === "TURNSTILE_VERIFICATION_FAILED"
      ) {
        try {
          return await assistTurnstile(account as SiteAccount, context)
        } catch (assistError) {
          return mapSub2ApiCheckInMutationError(assistError, context)
        }
      }
      return mapSub2ApiCheckInMutationError(error, context)
    }
  },
}
