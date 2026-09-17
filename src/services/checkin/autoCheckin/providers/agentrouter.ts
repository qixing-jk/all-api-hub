import { BROWSER_OAUTH_STATUS } from "~/constants/browserOAuth"
import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { loginAccount } from "~/services/accountLogin"
import { isAgentRouterLoginUrl } from "~/services/accountLogin/providers/agentrouter/config"
import {
  fetchAgentRouterPublicStatus,
  type AgentRouterPublicStatusEnvelope,
} from "~/services/apiService/agentrouter/status"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import { AuthTypeEnum } from "~/types/auth"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinSkipReasonTranslationKey,
} from "~/types/autoCheckin"
import { safeRandomUUID } from "~/utils/core/identifier"

import { getLoginCheckInProvider } from "./agentrouter/config"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderReadContext,
} from "./contracts"

interface Dependencies {
  loginAccount: typeof loginAccount
  fetchStatus(
    context: AutoCheckinProviderReadContext,
  ): Promise<AgentRouterPublicStatusEnvelope>
  createRequestId(): string
}

/** Performs login for its check-in result, without accessing account storage. */
export function createAgentRouterProvider(
  deps: Dependencies,
): AutoCheckinProvider {
  return {
    getReadiness(account) {
      return account.account_info?.id && isAgentRouterLoginUrl(account.site_url)
        ? { ready: true }
        : {
            ready: false,
            reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
          }
    },
    async detect(context) {
      const url = context.account?.site_url ?? context.request?.baseUrl
      let matched = false
      // A discovery candidate must not contact unrelated New API deployments.
      if (isAgentRouterLoginUrl(url)) {
        const status = await deps.fetchStatus(context)
        matched =
          status.success === true &&
          status.data?.system_name === "Agent Router" &&
          (status.data.github_oauth === true ||
            status.data.linuxdo_oauth === true)
      }
      return {
        outcome: matched
          ? CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched
          : CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
        evidence: {
          source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
          observedAt: context.observedAt,
        },
      }
    },
    async checkIn(account) {
      if (
        !("site_type" in account) ||
        !account.account_info?.id ||
        !isAgentRouterLoginUrl(account.site_url)
      ) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
          retryable: false,
        }
      }
      // agentrouter.org (verified 2026-09-13) grants the check-in benefit during
      // a fresh OAuth login. The content handler checks callback/self identity;
      // the browser context also compares it with this saved account.
      const result = await deps.loginAccount({
        account,
        provider: getLoginCheckInProvider(account.checkIn),
        requestId: deps.createRequestId(),
      })
      if (result.status === BROWSER_OAUTH_STATUS.Authenticated) {
        return result.evidence.checkedIn
          ? {
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              messageKey:
                AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
            }
          : {
              status: CHECKIN_RESULT_STATUS.UNCERTAIN,
              messageKey:
                AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.unknownError,
              retryable: false,
            }
      }

      // Another login still holds the shared agentrouter.org browser session,
      // so this attempt never reached the site. Ask for a later retry instead
      // of reporting an expired login.
      if (result.status === BROWSER_OAUTH_STATUS.SessionBusy) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.sessionBusy,
          retryable: false,
        }
      }

      if (result.status === BROWSER_OAUTH_STATUS.InteractionRequired) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          messageKey: getAutoCheckinSkipReasonTranslationKey(
            AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
          ),
          reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
          retryable: false,
        }
      }
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
        retryable: false,
      }
    },
  }
}

export const agentRouterProvider = createAgentRouterProvider({
  loginAccount,
  fetchStatus: async (context) =>
    await fetchAgentRouterPublicStatus(
      {
        baseUrl: context.account?.site_url ?? context.request!.baseUrl,
        auth: { authType: AuthTypeEnum.None },
      },
      context.signal,
    ),
  createRequestId: () => safeRandomUUID("agentrouter-login-checkin"),
})
