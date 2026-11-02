import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import {
  AutoDetectCompletionError,
  completeAutoDetectedAccount,
  getAutoDetectCompletionFailureReason,
} from "~/services/accounts/autoDetectCompletion/completion"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import {
  isCanonicalNovitaUrl,
  NOVITA_DISPLAY_NAME,
  NOVITA_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import type {
  AccountOnboardingCapability,
  AccountOnboardingRequest,
  AccountOnboardingSession,
} from "~/services/apiAdapters/contracts/accountOnboarding"
import { getNovitaSafeErrorMessage } from "~/services/apiAdapters/novita/accountPersistence"
import {
  encodeNovitaCredentials,
  parseNovitaCredentials,
} from "~/services/apiService/novita/constants"
import {
  isNovitaAuthFailureError,
  isNovitaConsoleCredential,
} from "~/services/apiService/novita/transport"
import { autoDetectSmart } from "~/services/siteDetection/autoDetectService"
import { AuthTypeEnum } from "~/types"
import type { AccountAutoDetectResponse } from "~/types/serviceResponse"
import { t } from "~/utils/i18n/core"

/** Console discovery supplies a credential; Novita requires no key-issuance stage. */
export const novitaAccountOnboarding: AccountOnboardingCapability = {
  matchesUrl: isCanonicalNovitaUrl,
  createSession: createNovitaOnboardingSession,
}

/** Keep explicit credential mode and console recovery within one onboarding attempt. */
function createNovitaOnboardingSession(
  params: AccountOnboardingRequest,
): AccountOnboardingSession {
  const existing = params.existingAccount
  const accessToken =
    existing &&
    isCanonicalNovitaUrl(existing.url) &&
    (existing.siteType === SITE_TYPES.NOVITA ||
      existing.siteType === SITE_TYPES.UNKNOWN)
      ? existing.accessToken.trim()
      : ""
  const recoveryData: AccountAutoDetectRecoveryData = {
    siteType: SITE_TYPES.NOVITA,
    siteName: NOVITA_DISPLAY_NAME,
    exchangeRate: DEFAULT_USD_TO_CNY_RATE,
    authType: AuthTypeEnum.AccessToken,
  }
  let discovered: { userId: string; accessToken: string } | undefined

  /** Retain known provider and identity facts when automatic completion is unavailable. */
  function manualGuidance(): AccountAutoDetectResponse {
    const message =
      existing?.novitaCredentialMode === "console"
        ? t("messages:novita.consoleAcquisitionFailed")
        : t("messages:novita.apiKeyRequired")
    return {
      kind: "detected",
      success: false,
      message,
      autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
      detailedError: {
        type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
        message,
        canUseApiCredentialFallback: false,
      },
      recoveryData,
    }
  }

  return {
    async verifyExistingCredentials() {
      if (accessToken && existing?.novitaCredentialMode !== "console") {
        try {
          const verificationToken =
            existing?.novitaCredentialMode === "api-key"
              ? parseNovitaCredentials(accessToken).apiKey
              : accessToken
          const data = await completeAutoDetectedAccount({
            url: NOVITA_WEB_ORIGIN,
            requestedAuthType: AuthTypeEnum.AccessToken,
            protectionBypassExecution: params.protectionBypassExecution,
            detected: {
              siteType: SITE_TYPES.NOVITA,
              userId: "",
              accessToken: verificationToken,
            },
          })
          if (
            existing?.userId.trim() &&
            data.userId !== existing.userId.trim()
          ) {
            throw new AutoDetectCompletionError(
              AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
              new Error("Novita account identity mismatch"),
            )
          }
          return {
            kind: "detected",
            success: true,
            message: t("accountDialog:messages.autoDetectSuccess"),
            data: { ...data, accessToken },
          }
        } catch (error) {
          const cause =
            error instanceof AutoDetectCompletionError ? error.cause : error
          const reason = getAutoDetectCompletionFailureReason(error)
          const message =
            reason === AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch
              ? t("accountDialog:messages.autoDetectIdentityMismatch")
              : getNovitaSafeErrorMessage(
                  cause,
                  t("messages:novita.networkFallback"),
                )
          if (
            existing?.novitaCredentialMode === "api-key" ||
            !(
              isNovitaConsoleCredential(accessToken) &&
              isNovitaAuthFailureError(cause)
            )
          )
            return {
              kind: "detected",
              success: false,
              message,
              autoDetectFailureReason: reason,
              detailedError: {
                type: AutoDetectErrorType.INVALID_RESPONSE,
                message,
                canUseApiCredentialFallback: false,
              },
              recoveryData,
            }
        }
      }
      return undefined
    },
    async discoverIdentity() {
      if (existing?.novitaCredentialMode === "api-key") return
      const detected = await autoDetectSmart(
        NOVITA_WEB_ORIGIN,
        params.protectionBypassExecution,
        params.diagnostics,
      )
      if (!detected.success || detected.data.siteType !== SITE_TYPES.NOVITA)
        return
      const userId = normalizeAccountIdentity(detected.data.userId)
      const username = detected.data.user.username?.trim()
      if (!userId || !username) return
      if (
        existing &&
        isCanonicalNovitaUrl(existing.url) &&
        existing.siteType === SITE_TYPES.NOVITA &&
        existing.userId.trim() &&
        existing.userId.trim() !== userId
      ) {
        throw new AutoDetectCompletionError(
          AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
          new Error("Novita account identity mismatch"),
        )
      }
      Object.assign(recoveryData, { userId, username })
      if (
        detected.data.accessToken &&
        isNovitaConsoleCredential(detected.data.accessToken)
      ) {
        discovered = { userId, accessToken: detected.data.accessToken }
      }
    },
    async verifyAccount() {
      if (!discovered) return manualGuidance()
      const data = await completeAutoDetectedAccount({
        url: NOVITA_WEB_ORIGIN,
        requestedAuthType: AuthTypeEnum.AccessToken,
        protectionBypassExecution: params.protectionBypassExecution,
        detected: { siteType: SITE_TYPES.NOVITA, ...discovered },
      })
      if (data.userId !== discovered.userId) {
        throw new AutoDetectCompletionError(
          AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
          new Error("Novita account identity mismatch"),
        )
      }
      return {
        kind: "detected",
        success: true,
        message: t("accountDialog:messages.autoDetectSuccess"),
        data: {
          ...data,
          accessToken: encodeNovitaCredentials({
            apiKey: parseNovitaCredentials(accessToken).apiKey,
            consoleToken: parseNovitaCredentials(data.accessToken).consoleToken,
          }),
        },
      }
    },
    fail(error) {
      const reason = getAutoDetectCompletionFailureReason(error)
      const mismatch =
        reason === AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch
      if (
        mismatch ||
        (existing?.novitaCredentialMode === "console" && accessToken)
      ) {
        const cause =
          error instanceof AutoDetectCompletionError ? error.cause : error
        const message = mismatch
          ? t("accountDialog:messages.autoDetectIdentityMismatch")
          : getNovitaSafeErrorMessage(
              cause,
              t("messages:novita.networkFallback"),
            )
        return {
          kind: "detected",
          success: false,
          message,
          ...(mismatch ? { autoDetectFailureReason: reason } : {}),
          detailedError: {
            type: AutoDetectErrorType.INVALID_RESPONSE,
            message,
            canUseApiCredentialFallback: false,
          },
          recoveryData,
        }
      }
      // Signed-out, unavailable and challenged sessions retain the manual path.
      return manualGuidance()
    },
  }
}
