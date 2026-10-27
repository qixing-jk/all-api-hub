import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type { AccountAutoDetectExistingAccount } from "~/services/accounts/autoDetect/existingCredentials"
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
import type { AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import { getNovitaSafeErrorMessage } from "~/services/apiAdapters/novita/accountPersistence"
import {
  encodeNovitaCredentials,
  parseNovitaCredentials,
} from "~/services/apiService/novita/constants"
import {
  isNovitaAuthFailureError,
  isNovitaConsoleCredential,
} from "~/services/apiService/novita/transport"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { autoDetectSmart } from "~/services/siteDetection/autoDetectService"
import { AuthTypeEnum } from "~/types"
import type { AccountAutoDetectResponse } from "~/types/serviceResponse"
import { t } from "~/utils/i18n/core"

/** Known provider facts survive the handoff to console-owned key acquisition. */
export async function onboardNovitaAccount(params: {
  existingAccount?: AccountAutoDetectExistingAccount
  protectionBypassExecution?: ProtectionBypassExecution
  diagnostics?: AccountDetectionDiagnostics
}): Promise<AccountAutoDetectResponse> {
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
      if (existing?.userId.trim() && data.userId !== existing.userId.trim()) {
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
  // Fresh onboarding defaults to the verified console bearer, whose scope
  // covers management. A pasted sk_ key remains an explicit alternative.
  if (existing?.novitaCredentialMode !== "api-key")
    try {
      const detected = await autoDetectSmart(
        NOVITA_WEB_ORIGIN,
        params.protectionBypassExecution,
        params.diagnostics,
      )
      if (detected.success && detected.data.siteType === SITE_TYPES.NOVITA) {
        const userId = normalizeAccountIdentity(detected.data.userId)
        const username = detected.data.user.username?.trim()
        if (userId && username) {
          if (
            existing &&
            isCanonicalNovitaUrl(existing.url) &&
            existing.siteType === SITE_TYPES.NOVITA &&
            existing.userId.trim() &&
            existing.userId.trim() !== userId
          ) {
            const message = t(
              "accountDialog:messages.autoDetectIdentityMismatch",
            )
            return {
              kind: "detected",
              success: false,
              message,
              autoDetectFailureReason:
                AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
              detailedError: {
                type: AutoDetectErrorType.INVALID_RESPONSE,
                message,
                canUseApiCredentialFallback: false,
              },
              recoveryData,
            }
          }
          recoveryData.userId = userId
          recoveryData.username = username
          if (isNovitaConsoleCredential(detected.data.accessToken)) {
            const data = await completeAutoDetectedAccount({
              url: NOVITA_WEB_ORIGIN,
              requestedAuthType: AuthTypeEnum.AccessToken,
              protectionBypassExecution: params.protectionBypassExecution,
              detected: {
                siteType: SITE_TYPES.NOVITA,
                userId,
                accessToken: detected.data.accessToken,
              },
            })
            if (data.userId !== userId) {
              return {
                kind: "detected",
                success: false,
                message: t("accountDialog:messages.autoDetectIdentityMismatch"),
                autoDetectFailureReason:
                  AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
                recoveryData,
              }
            }
            return {
              kind: "detected",
              success: true,
              message: t("accountDialog:messages.autoDetectSuccess"),
              data: {
                ...data,
                accessToken: encodeNovitaCredentials({
                  apiKey: parseNovitaCredentials(accessToken).apiKey,
                  consoleToken: parseNovitaCredentials(data.accessToken)
                    .consoleToken,
                }),
              },
            }
          }
        }
      }
    } catch (error) {
      if (existing?.novitaCredentialMode === "console" && accessToken) {
        const cause =
          error instanceof AutoDetectCompletionError ? error.cause : error
        const message = getNovitaSafeErrorMessage(
          cause,
          t("messages:novita.networkFallback"),
        )
        return {
          kind: "detected",
          success: false,
          message,
          detailedError: {
            type: AutoDetectErrorType.INVALID_RESPONSE,
            message,
            canUseApiCredentialFallback: false,
          },
          recoveryData,
        }
      }
      // Signed-out, unavailable and challenged sessions retain the manual path.
    }
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
