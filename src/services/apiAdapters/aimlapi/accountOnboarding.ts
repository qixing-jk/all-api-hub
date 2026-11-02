import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import {
  AIMLAPI_DISPLAY_NAME,
  AIMLAPI_WEB_ORIGIN,
  isCanonicalAimlApiUrl,
  isRecognizedAimlApiUrl,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import { AIMLAPI_CONSOLE_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import type {
  AccountOnboardingCapability,
  AccountOnboardingRequest,
  AccountOnboardingSession,
} from "~/services/apiAdapters/contracts/accountOnboarding"
import { createAimlApiConsoleClient } from "~/services/apiService/aimlapi/console"
import { AIMLAPI_ONBOARDING_ERRORS as errors } from "~/services/apiService/aimlapi/constants"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/configuration/compatibilityConfig"
import type { AutoDetectData } from "~/services/siteDetection/autoDetectContracts"
import { autoDetectSmart } from "~/services/siteDetection/autoDetectService"
import { AuthTypeEnum } from "~/types"
import type { AccountAutoDetectResponse } from "~/types/serviceResponse"
import { t } from "~/utils/i18n/core"

import { fetchAimlApiUserInfo } from "./accountIdentity"
import { aimlApiAccountPersistence } from "./accountPersistence"
import {
  AIMLAPI_CONNECTION_KEY_KINDS as connectionKeyKinds,
  obtainAimlApiConnectionKey,
} from "./connectionCredentials"

/** Durable credential issuance remains an explicitly authorized provider stage. */
export const aimlApiAccountOnboarding: AccountOnboardingCapability = {
  matchesUrl: isRecognizedAimlApiUrl,
  createSession: createAimlApiOnboardingSession,
}

/** Keep credentials, discovered identity and recovery facts local to one attempt. */
function createAimlApiOnboardingSession(
  params: AccountOnboardingRequest,
): AccountOnboardingSession {
  let primary = params.existingAccount?.accessToken.trim() || ""
  let regular = params.existingAccount?.aimlApiKey?.trim() || ""
  let acquisitionAttempted = false
  let userId = "",
    username = ""
  const recoveryData: AccountAutoDetectRecoveryData = {
    siteType: SITE_TYPES.AIMLAPI,
    siteName: AIMLAPI_DISPLAY_NAME,
    authType: AuthTypeEnum.AccessToken,
    exchangeRate: DEFAULT_USD_TO_CNY_RATE,
  }
  const checkIn = createCompatibilityCheckInConfig({
    siteType: SITE_TYPES.AIMLAPI,
    supported: false,
    automaticExecutionEnabled: false,
  })
  let detected: AutoDetectData | undefined
  /** Resolve credential-owned identity and cross-check it when acquired through a session. */
  async function verifyAccount(): Promise<AccountAutoDetectResponse> {
    const info = await fetchAimlApiUserInfo({
      baseUrl: AIMLAPI_WEB_ORIGIN,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: primary },
      ...(regular ? { aimlApiKey: regular } : {}),
    })
    if (userId && regular && info.id !== userId)
      throw new Error(errors.IdentityMismatch)
    userId = info.id
    username = info.username
    return {
      kind: "detected",
      success: true,
      message: t("accountDialog:messages.autoDetectSuccess"),
      data: {
        siteType: SITE_TYPES.AIMLAPI,
        siteName: AIMLAPI_DISPLAY_NAME,
        username,
        userId,
        accessToken: primary,
        exchangeRate: DEFAULT_USD_TO_CNY_RATE,
        authType: AuthTypeEnum.AccessToken,
        checkIn,
        ...(regular ? { aimlApiAuth: { apiKey: regular } } : {}),
      },
    }
  }
  return {
    async verifyExistingCredentials() {
      if (
        params.existingAccount &&
        (!isCanonicalAimlApiUrl(params.existingAccount.url) ||
          params.existingAccount.siteType !== SITE_TYPES.AIMLAPI)
      ) {
        const message = t("accountDialog:messages.autoDetectIdentityMismatch")
        return {
          kind: "detected",
          success: false,
          message,
          detailedError: {
            type: AutoDetectErrorType.INVALID_RESPONSE,
            message,
            canUseApiCredentialFallback: false,
          },
        }
      }
      if (primary) return verifyAccount()
    },
    async discoverIdentity() {
      const session = await autoDetectSmart(
        AIMLAPI_WEB_ORIGIN,
        params.protectionBypassExecution,
      ).catch(() => null)
      detected = session?.success ? session.data : undefined
      if (detected?.siteType === SITE_TYPES.AIMLAPI) {
        userId = String(detected.userId)
        username = String(detected.user?.username || "")
        Object.assign(recoveryData, { userId, username })
      }
    },
    async acquireCredentials() {
      if (params.allowCredentialCreation !== true)
        throw new Error(errors.ManualCredentialRequired)
      const auth = detected?.transientAuth
      if (
        auth?.kind !== AIMLAPI_CONSOLE_TRANSIENT_AUTH_KIND ||
        auth.userId !== userId
      )
        throw new Error(errors.SessionUnavailable)
      const consoleClient = createAimlApiConsoleClient(auth.token, params)
      // Re-read identity immediately before issuance; cached browser identity cannot authorize it.
      await consoleClient.verifyIdentity(userId)
      const accounts = await accountQueries.getAllAccountsOrThrow()
      const saved = accounts.find(
        (a) =>
          a.site_type === SITE_TYPES.AIMLAPI &&
          String(a.account_info.id) === userId &&
          a.aimlApiAuth?.apiKey,
      )
      if (saved) {
        primary = saved.account_info.access_token
        regular = saved.aimlApiAuth!.apiKey
      } else
        for (const kind of [
          connectionKeyKinds.Management,
          connectionKeyKinds.Regular,
        ]) {
          acquisitionAttempted = true
          const connection = await obtainAimlApiConnectionKey(
            userId,
            kind,
            () =>
              consoleClient.createConnectionKey({
                userId,
                name: `All API Hub ${kind}`,
                isManagement: kind === connectionKeyKinds.Management,
              }),
          )
          if (kind === connectionKeyKinds.Management) {
            primary = connection.key
            recoveryData.accessToken = primary
          } else {
            regular = connection.key
            recoveryData.aimlApiKey = regular
          }
        }
    },
    verifyAccount,
    fail(error) {
      const message =
        error instanceof Error && error.message === errors.IdentityMismatch
          ? t("accountDialog:messages.autoDetectIdentityMismatch")
          : params.existingAccount?.accessToken.trim()
            ? aimlApiAccountPersistence.getValidationFailureMessage(error)
            : acquisitionAttempted
              ? t("accountDialog:form.autoCreateAccessTokenUnconfirmed")
              : t("messages:aimlapi.managementKeyRequired")
      return {
        kind: "detected",
        success: false,
        message,
        recoveryData: {
          ...recoveryData,
          ...(primary ? { accessToken: primary } : {}),
          ...(regular ? { aimlApiKey: regular } : {}),
        },
        detailedError: {
          type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
          message,
          canUseApiCredentialFallback: false,
        },
      }
    },
  }
}
