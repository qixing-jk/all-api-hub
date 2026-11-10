import { CHECK_IN_PROVIDER_READINESS_REASONS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { executeWithAccountCredentialRecovery } from "~/services/accountCredentialRecovery"
import { resolveAccountLogin } from "~/services/accountLogin/configCodec"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  createTerminalFailureResult,
  createUpstreamFailureResult,
  isAlreadyCheckedMessage,
  matchTerminalFailureReason,
  normalizeCheckinMessage,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

import type {
  AnyrouterCheckInParams,
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "./contracts"

interface AnyrouterCheckInResponse {
  code?: number
  ret?: number
  success?: boolean
  message?: string
  msg?: string
}

const isSiteAccount = (
  account: SiteAccount | AnyrouterCheckInParams,
): account is SiteAccount => "site_type" in account

const checkinAnyRouter = async (
  account: SiteAccount | AnyrouterCheckInParams,
  context: AutoCheckinProviderContext,
): Promise<AutoCheckinProviderOutcome> => {
  const tempWindowRequestSource = normalizeTempWindowRequestSource(
    context.tempWindowRequestSource,
  )
  const protectionBypassExecution = context.protectionBypassExecution
  const { site_url, account_info } = account
  let cookieAuthSessionCookie = isSiteAccount(account)
    ? account.cookieAuth?.sessionCookie
    : account.cookieAuthSessionCookie

  try {
    if (
      isSiteAccount(account) &&
      resolveAccountLogin(account)?.automaticRecovery === true
    ) {
      // Authenticate before dispatch: a rejected mutation is never replayed.
      const verifiedRequest = await executeWithAccountCredentialRecovery(
        {
          baseUrl: site_url,
          accountId: account.id,
          allowAccountCredentialRecovery: true,
          siteType: SITE_TYPES.ANYROUTER,
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: account_info.id,
            cookie: cookieAuthSessionCookie,
          },
          cookieAuthSessionCookie,
          tempWindowRequestSource,
          protectionBypassExecution,
          forceTempWindow: true,
        },
        async (request) => {
          const self = await newApiFamilyRequests.data<{
            id?: string | number
          }>(request, { endpoint: "/api/user/self" })
          if (String(self.id) !== String(account_info.id))
            throw new ApiError(
              "AnyRouter login belongs to another account",
              undefined,
              "/api/user/self",
              API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
            )
          return request
        },
      )
      cookieAuthSessionCookie = verifiedRequest.auth.cookie
      if (
        context.beforeRecoveredMutation &&
        !(await context.beforeRecoveredMutation())
      ) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
          messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
        }
      }
    }
    const response = (await newApiFamilyRequests.envelope(
      bindApiTransportRequest(
        {
          baseUrl: site_url,
          ...(account.id ? { accountId: account.id } : {}),
          ...(cookieAuthSessionCookie ? { cookieAuthSessionCookie } : {}),
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: account_info.id,
          },
          tempWindowRequestSource,
          // AnyRouter's sign-in POST relies on browser-established WAF cookies;
          // see https://github.com/millylee/anyrouter-check-in.
          // Keep it in one protected context instead of replaying a mutating request.
          forceTempWindow: true,
          ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
          ...(context.mutationLifecycle
            ? { observer: context.mutationLifecycle }
            : {}),
        },
        API_DIRECT_REQUEST_REASONS.CallerManaged,
      ),
      {
        endpoint: "/api/user/sign_in",
        options: {
          method: "POST",
          body: "{}",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        },
      },
    )) as AnyrouterCheckInResponse

    const rawResponseMessage = normalizeCheckinMessage(
      response.message ?? response.msg,
    )
    if (isAlreadyCheckedMessage(rawResponseMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: rawResponseMessage || undefined,
        messageKey: rawResponseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
      }
    }

    // Compatibility evidence: millylee/anyrouter-check-in@514fe09 treats
    // `success`, `ret === 1`, and `code === 0` as independent positive signals.
    const succeeded =
      response.success === true || response.ret === 1 || response.code === 0
    if (succeeded) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        rawMessage: rawResponseMessage || undefined,
        messageKey: rawResponseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: response,
      }
    }

    const terminalReason = matchTerminalFailureReason(rawResponseMessage)
    if (terminalReason) {
      return createTerminalFailureResult({
        reasonCode: terminalReason,
        rawMessage: rawResponseMessage,
        data: response,
      })
    }

    return createUpstreamFailureResult({
      rawMessage: rawResponseMessage,
      data: response,
    })
  } catch (error: unknown) {
    return resolveProviderErrorResult({
      error,
      mutationDispatched: context.mutationLifecycle?.dispatched,
    })
  }
}

const getReadiness = (account: SiteAccount) => {
  if (!account.account_info?.id) {
    return {
      ready: false,
      reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
    } as const
  }

  return { ready: true } as const
}

export const anyrouterProvider: AutoCheckinProvider = {
  // /api/user/sign_in is a mutating POST, so this provider intentionally has
  // no detect/getStatus implementation and uses the legacy registry bridge.
  getReadiness,
  checkIn: checkinAnyRouter,
}
