import { CHECK_IN_PROVIDER_READINESS_REASONS } from "~/constants/checkIn"
import { fetchApi } from "~/services/apiService/newApiFamily/request"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
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
): Promise<AutoCheckinProviderResult> => {
  const tempWindowRequestSource = normalizeTempWindowRequestSource(
    context.tempWindowRequestSource,
  )
  const protectionBypassExecution = context.protectionBypassExecution
  const { site_url, account_info } = account
  const cookieAuthSessionCookie = isSiteAccount(account)
    ? account.cookieAuth?.sessionCookie
    : account.cookieAuthSessionCookie

  try {
    const response = await fetchApi<AnyrouterCheckInResponse>(
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
      true,
    )

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

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: rawResponseMessage || undefined,
      messageKey: rawResponseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: response ?? undefined,
    }
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
