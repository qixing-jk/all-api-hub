import type { AccountLoginProvider } from "~/constants/accountLogin"
import { BROWSER_OAUTH_STATUS } from "~/constants/browserOAuth"
import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { loginAccount } from "~/services/accountLogin"
import { resolveLoginCheckInProvider } from "~/services/accountLogin/providerClaims"
import {
  LOGIN_PROVIDER_EVIDENCE_OUTCOMES,
  loginProviderEvidence,
  type LoginProviderEvidenceOutcome,
} from "~/services/accountLogin/providerEvidence"
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
  /**
   * Persists what this attempt proved, so the next run can prefer the account
   * the browser's provider identity actually matches.
   */
  recordLoginProviderEvidence(input: {
    accountId: string
    provider: AccountLoginProvider
    outcome: LoginProviderEvidenceOutcome
  }): Promise<void>
}

/** Persists one outcome through the shared evidence store. */
async function recordLoginProviderEvidence(input: {
  accountId: string
  provider: AccountLoginProvider
  outcome: LoginProviderEvidenceOutcome
}): Promise<void> {
  await loginProviderEvidence.record(input)
}

/**
 * Maps one login outcome onto stored evidence.
 *
 * Only an authenticated login or a proven identity mismatch says anything about
 * ownership. A cancelled, timed-out, or otherwise inconclusive attempt must not
 * be remembered as a rejection, or the account would lose its claim for a
 * reason unrelated to the browser identity.
 */
function resolveProviderEvidenceOutcome(
  loginStatus: string,
): LoginProviderEvidenceOutcome | null {
  if (loginStatus === BROWSER_OAUTH_STATUS.Authenticated) {
    return LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success
  }
  if (loginStatus === BROWSER_OAUTH_STATUS.IdentityMismatch) {
    return LOGIN_PROVIDER_EVIDENCE_OUTCOMES.IdentityMismatch
  }
  return null
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
          reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
          messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
          retryable: false,
        }
      }
      // Never fall back to a default provider: signing in with GitHub for an
      // account that actually uses another provider would run the wrong OAuth
      // identity. Fail visibly and let the user select the login method.
      const provider = resolveLoginCheckInProvider(account.checkIn)
      if (!provider) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.loginProviderRequired,
          retryable: false,
        }
      }

      // agentrouter.org (verified 2026-09-13) grants the check-in benefit during
      // a fresh OAuth login. The content handler checks callback/self identity;
      // the browser context also compares it with this saved account.
      const result = await deps.loginAccount({
        account,
        provider,
        requestId: deps.createRequestId(),
      })
      // Record what this attempt proved about the browser identity, but only
      // when it proved anything: a cancelled or inconclusive login must not be
      // remembered as a rejection, or the account would lose its claim for a
      // reason unrelated to which identity the browser holds.
      const outcome = resolveProviderEvidenceOutcome(result.status)
      if (outcome) {
        await deps.recordLoginProviderEvidence({
          accountId: account.id,
          provider,
          outcome,
        })
      }
      if (result.status === BROWSER_OAUTH_STATUS.Authenticated) {
        return result.evidence.checkedIn
          ? {
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              messageKey:
                AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
            }
          : {
              status: CHECKIN_RESULT_STATUS.UNCERTAIN,
              reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
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
          reasonCode: AUTO_CHECKIN_SKIP_REASON.SESSION_BUSY,
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
        reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
        messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
        retryable: false,
      }
    },
  }
}

export const agentRouterProvider = createAgentRouterProvider({
  loginAccount,
  recordLoginProviderEvidence,
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
