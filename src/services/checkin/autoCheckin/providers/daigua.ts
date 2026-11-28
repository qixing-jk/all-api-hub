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
import {
  PASSIVE_CHECK_IN_AUTH,
  type Sub2ApiCheckInStatusAuth,
} from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { normalizeCheckInPagePath } from "~/services/checkin/autoCheckin/configuration/nativePagePath"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_TURNSTILE_STATUSES } from "~/types/tempWindowFetch"
import { TURNSTILE_PRE_TRIGGER_KINDS } from "~/types/turnstile"
import { tempWindowTurnstileFetch } from "~/utils/browser/tempWindowFetch"

import type {
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  getBoundCheckInPageHandoff,
  withSub2ApiCheckInExecution,
} from "./sub2apiExecution"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  readUsdAwards,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const readStatus = async (
  context: AutoCheckinProviderReadContext,
  auth?: Sub2ApiCheckInStatusAuth,
) =>
  toSub2ApiCheckInStatus(
    await fetchDaiguaDailyCheckInStatus(
      createSub2ApiCheckInReadRequest(context),
      auth,
    ),
    context.observedAt,
  )

const success = (account: SiteAccount, data: { rewardAmount: number }) => ({
  status: CHECKIN_RESULT_STATUS.SUCCESS,
  messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
  awards: readUsdAwards(account, data.rewardAmount, {
    operation: DAIGUA_CHECK_IN_ENDPOINT,
    field: "reward_amount",
  }),
  data,
})

/** Browser token acquisition belongs to the shared channel; wire facts stay here. */
async function assistTurnstile(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
  request: ApiServiceRequest,
) {
  let checkInUrl = new URL(
    normalizeCheckInPagePath(account.checkIn.nativePagePath) ?? "/checkin",
    account.site_url,
  ).href
  const manual = () => ({
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
    messageKey: "autoCheckin:providerFallback.nativePageVerificationRequired",
    messageParams: { checkInUrl },
  })
  const handoff = getBoundCheckInPageHandoff(request, checkInUrl)
  if (handoff) return handoff
  if (
    context.beforeRecoveredMutation &&
    !(await context.beforeRecoveredMutation())
  ) {
    return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE)
  }
  // Another native action may have completed the shared ordinary/lucky day.
  const observation = await readDayStableCheckInObservation(() =>
    fetchDaiguaDailyCheckInStatus({ ...request, observer: undefined }),
  )
  if (!observation) return manual()
  const status = toSub2ApiCheckInStatus(
    observation.observation,
    observation.observedAt,
  )
  if (status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked) {
    return withCheckInConfirmation(
      account,
      { status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED },
      { kind: CHECK_IN_CONFIRMATION_KINDS.Observed, status },
    )
  }
  if (status.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled)
    return manual()
  const response = await executeAuthenticatedSub2ApiRequest(
    request,
    DAIGUA_CHECK_IN_ENDPOINT,
    (authenticatedRequest) =>
      tempWindowTurnstileFetch({
        originUrl: account.site_url,
        pageUrl: checkInUrl,
        discoverCheckInPage: !normalizeCheckInPagePath(
          account.checkIn.nativePagePath,
        ),
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
          kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector,
          selector: '[data-testid="header-normal-checkin"]',
          throttle: { maxAttempts: 1 },
        },
        tempWindowRequestSource: context.tempWindowRequestSource,
        protectionBypassExecution: context.protectionBypassExecution,
      }),
    PASSIVE_CHECK_IN_AUTH,
  )
  if (response.pageUrl) checkInUrl = response.pageUrl
  if (
    response.turnstile?.status !== TEMP_WINDOW_TURNSTILE_STATUSES.TokenObtained
  )
    return manual()
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
  return success(account, result)
}

export const daiguaProvider = withSub2ApiCheckInExecution({
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getSub2ApiCheckInReadiness,
  getStatus: readStatus,
  async checkIn(account, context, attempt) {
    if (
      context.statusProof?.availability !==
        CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      context.statusProof.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }
    let request = attempt?.request
    try {
      request ??= createSub2ApiCheckInMutationRequest(
        account as SiteAccount,
        context,
      )
      const data = await performDaiguaDailyCheckIn(request, {
        ...attempt?.recovery,
        beforeRecoveredMutation: context.beforeRecoveredMutation,
      })
      return success(account as SiteAccount, data)
    } catch (error) {
      // The native verifier posts a body token, unlike New API's query token.
      // An explicit verification rejection is the only safe assisted retry.
      if (
        request &&
        error instanceof ApiError &&
        error.upstreamCode === "TURNSTILE_VERIFICATION_FAILED"
      ) {
        try {
          return await assistTurnstile(account as SiteAccount, context, request)
        } catch (assistError) {
          return mapSub2ApiCheckInMutationError(
            assistError,
            context,
            account as SiteAccount,
          )
        }
      }
      return mapSub2ApiCheckInMutationError(
        error,
        context,
        account as SiteAccount,
      )
    }
  },
})
