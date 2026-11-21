/**
 * Veloera auto check-in provider.
 *
 * Endpoint: POST `/api/user/check_in`.
 */

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { fetchSupportCheckIn } from "~/services/apiService/newApiFamily/variants/veloeraCheckIn"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  createUpstreamFailureResult,
  getAccountIdentityCheckinReadiness,
  getEffectiveAuthType,
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
  readQuotaAwards,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import { reconcileCheckInResult } from "~/services/checkin/autoCheckin/resultReconciliation"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import type { SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { isPlainObject } from "~/utils/core/object"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "./contracts"
import { detectWithStatusReadback } from "./detection"

type CheckinResult = AutoCheckinProviderOutcome

const ENDPOINT = "/api/user/check_in"

/**
 * Read the awarded quota from this deployment's untyped success payload.
 *
 * Upstream answers a successful check-in with
 * `{success, message: "签到成功", data: {quota: reward}}`, where the reward is
 * added to the user's quota, so it is already in the internal quota unit:
 * https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/user.go
 * The payload stays `unknown` at the transport because this is the only part of
 * the shape the extension consumes.
 */
const readAwardedQuota = (data: unknown): unknown =>
  isPlainObject(data) ? data.quota : undefined

// Veloera exposes the global switch through /api/status and today's state
// through /api/user/check_in_status. Keep these independent: `can_check_in`
// alone cannot prove that the site has enabled the feature.
// https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/user.go

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
      cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
      auth: {
        authType: getEffectiveAuthType(account),
        userId: account.account_info.id,
        accessToken: account.account_info.access_token,
      },
      ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
      ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
      ...(mutationLifecycle ? { observer: mutationLifecycle } : {}),
    },
    API_DIRECT_REQUEST_REASONS.CallerManaged,
  )

type VeloeraCheckInObservation = {
  enabled?: boolean
  canCheckIn?: boolean
}

/** Read the independent deployment switch and current user's daily state. */
async function fetchCheckInObservation(
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<VeloeraCheckInObservation | undefined> {
  const enabled = await fetchSupportCheckIn(request, signal)
  if (enabled === false) return { enabled }

  const data = await newApiFamilyRequests.data<{ can_check_in?: boolean }>(
    request,
    {
      endpoint: "/api/user/check_in_status",
      ...(signal ? { options: { signal } } : {}),
    },
  )
  if (typeof data.can_check_in === "boolean") {
    return { enabled, canCheckIn: data.can_check_in }
  }

  return enabled === true ? { enabled } : undefined
}

/**
 * Perform check-in for a Veloera account
 * @param account - The site account to check in
 * @returns Check-in result with status and message
 */
async function checkinVeloera(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): Promise<CheckinResult> {
  const tempWindowRequestSource = normalizeTempWindowRequestSource(
    context.tempWindowRequestSource,
  )
  const request = createRequest(
    account,
    tempWindowRequestSource,
    context.protectionBypassExecution,
    context.mutationLifecycle,
  )

  try {
    // Call the check-in API endpoint
    const response = await newApiFamilyRequests.envelope<unknown>(request, {
      endpoint: ENDPOINT,
      options: { method: "POST" },
    })

    const responseMessage = normalizeCheckinMessage(response?.message)

    // Check if response.message indicates already checked in
    if (responseMessage && isAlreadyCheckedMessage(responseMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: responseMessage || undefined,
        data: response.data ?? undefined,
      }
    }

    // Success case
    if (response.success) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        awards: readQuotaAwards(account, readAwardedQuota(response.data), {
          operation: ENDPOINT,
          field: "quota",
        }),
        data: response.data,
      }
    }

    // Veloera's failure copy is deployment-controlled. Confirm the current
    // state before deciding whether an arbitrary message means "already".
    const failure = createUpstreamFailureResult({
      rawMessage: responseMessage,
      data: response,
    })
    try {
      const observation = await readDayStableCheckInObservation(() =>
        fetchCheckInObservation(request),
      )
      if (observation) {
        const status = toVeloeraMethodStatus(
          observation.observation,
          observation.observedAt,
        )
        const result = reconcileCheckInResult({ result: failure, status })
        return withCheckInConfirmation(account, result, {
          kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
          status,
        })
      }
    } catch {
      // Preserve the original mutation failure if best-effort readback fails.
    }

    return failure
  } catch (error: unknown) {
    return resolveProviderErrorResult({
      error,
      mutationDispatched: context.mutationLifecycle?.dispatched,
    })
  }
}

const getStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async ({
  account,
  request,
  observedAt,
  signal,
}) => {
  const statusRequest =
    request ??
    (account
      ? {
          directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
          baseUrl: account.site_url,
          accountId: account.id,
          cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
          auth: {
            authType: getEffectiveAuthType(account),
            userId: account.account_info.id,
            accessToken: account.account_info.access_token,
          },
        }
      : undefined)
  if (!statusRequest) return undefined
  const observation = await fetchCheckInObservation(statusRequest, signal)
  if (!observation) return undefined
  return toVeloeraMethodStatus(observation, observedAt)
}

/** Map can-check-in into the shared day state used by admission and confirmation. */
function toVeloeraMethodStatus(
  observation: NonNullable<Awaited<ReturnType<typeof fetchCheckInObservation>>>,
  observedAt: number,
) {
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    ...(observation.enabled !== undefined
      ? {
          availability: observation.enabled
            ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
            : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
        }
      : {}),
    ...(observation.canCheckIn !== undefined
      ? {
          today: observation.canCheckIn
            ? CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
            : CHECK_IN_METHOD_TODAY_STATUSES.Checked,
        }
      : {}),
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }
}

export const veloeraProvider: AutoCheckinProvider = {
  getReadiness: getAccountIdentityCheckinReadiness,
  detect: (context) => detectWithStatusReadback(context, getStatus),
  getStatus,
  checkIn: checkinVeloera,
}
