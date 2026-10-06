import { isAccountLoginProvider } from "~/constants/accountLogin"
import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { type ContentSessionTransientAuth } from "~/services/accountSiteOnboarding/contracts"
import * as accountBootstrap from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { ApiError } from "~/services/apiTransport/errors"
import { type AuthTypeEnum } from "~/types"

export type CredentialFailureStage = "acquisition" | "completion"
export type CredentialFailure = {
  reason: AutoDetectFailureReason
  error: Error
  recoveryAuthType?: AuthTypeEnum
}
export type TrimString = (value: unknown) => string
export type CredentialPayload = {
  username?: unknown
  access_token?: unknown
  loginProviders?: unknown
  user?: unknown
}

export type CredentialImplementation = {
  fetchUserInfo: typeof accountBootstrap.fetchUserInfo
  getOrCreateAccessToken: typeof accountBootstrap.getOrCreateAccessToken
  readUsername(payload: CredentialPayload, trimString: TrimString): string
  selectDashboardAuth(
    value?: ContentSessionTransientAuth,
  ): ContentSessionTransientAuth | undefined
  classifyFailure(
    error: unknown,
    stage: CredentialFailureStage,
  ): CredentialFailure | undefined
  missingTokenReason: AutoDetectFailureReason
}

/** Rebuilds a credential error without reflected token text, retaining safe categories. */
export function createSafeCredentialError(
  error: unknown,
  message: string,
): Error {
  if (!(error instanceof ApiError)) return new Error(message)
  const safeError = new ApiError(
    message,
    error.statusCode,
    error.endpoint,
    error.code,
    error.upstreamCode,
  )
  safeError.originalCode = error.originalCode
  return safeError
}

/** Binds credential transport, normalization and recovery semantics to one variant. */
export function createNewApiAccountCredentialVariant(
  override: Partial<CredentialImplementation> = {},
) {
  const implementation: CredentialImplementation = {
    fetchUserInfo:
      accountBootstrap.defaultAccountBootstrapImplementation.fetchUserInfo,
    getOrCreateAccessToken:
      accountBootstrap.defaultAccountBootstrapImplementation
        .getOrCreateAccessToken,
    readUsername: (payload, trimString) => trimString(payload.username),
    selectDashboardAuth: () => undefined,
    classifyFailure: () => undefined,
    missingTokenReason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    ...override,
  }
  return {
    fetchUserInfo: implementation.fetchUserInfo,
    getOrCreateAccessToken: implementation.getOrCreateAccessToken,
    selectDashboardAuth: implementation.selectDashboardAuth,
    missingTokenReason: implementation.missingTokenReason,
    normalizeTokenInfo(tokenInfo: unknown, trimString: TrimString) {
      const payload: CredentialPayload =
        tokenInfo && typeof tokenInfo === "object" ? tokenInfo : {}
      return {
        username: implementation.readUsername(payload, trimString),
        accessToken: trimString(payload.access_token),
        loginProviders: Array.isArray(payload.loginProviders)
          ? payload.loginProviders.filter(isAccountLoginProvider)
          : [],
      }
    },
    interpretAcquisitionFailure(error: unknown): CredentialFailure | undefined {
      return implementation.classifyFailure(error, "acquisition")
    },
    interpretCompletionFailure(
      error: unknown,
      hasDashboardAuth: boolean,
    ): CredentialFailure {
      return (
        implementation.classifyFailure(error, "completion") ?? {
          reason: AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
          error: createSafeCredentialError(
            error,
            hasDashboardAuth
              ? "New API dashboard authentication could not be exchanged"
              : "Account access token could not be obtained",
          ),
        }
      )
    },
  }
}
