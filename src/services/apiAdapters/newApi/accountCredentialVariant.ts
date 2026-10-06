import { isAccountLoginProvider } from "~/constants/accountLogin"
import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND,
  type ContentSessionTransientAuth,
} from "~/services/accountSiteOnboarding/contracts"
import * as accountBootstrap from "~/services/apiService/newApiFamily/default/accountBootstrap"
import * as apiyi from "~/services/apiService/newApiFamily/variants/apiyi"
import * as rixApi from "~/services/apiService/newApiFamily/variants/rixApi"
import {
  readRixApiMajorVersion,
  recordRixApiMajorVersion,
} from "~/services/apiService/newApiFamily/variants/rixApiDialects"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

type CredentialFailureStage = "acquisition" | "completion"
type CredentialFailure = {
  reason: AutoDetectFailureReason
  error: Error
  recoveryAuthType?: AuthTypeEnum
}
type TrimString = (value: unknown) => string
type CredentialPayload = {
  username?: unknown
  access_token?: unknown
  loginProviders?: unknown
  user?: unknown
}

type CredentialImplementation = {
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
  observeSiteStatus(
    request: ApiServiceRequest,
    status: Awaited<ReturnType<typeof accountBootstrap.fetchSiteStatus>>,
  ): void
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

/** ModelFlare exposes its account label as display_name in /api/user/self. */
function readModelFlareUsername(
  payload: CredentialPayload,
  trimString: TrimString,
): string {
  const user =
    payload.user && typeof payload.user === "object"
      ? (payload.user as { display_name?: unknown })
      : undefined
  return trimString(payload.username) || trimString(user?.display_name)
}

/** Normalizes a credential label before it crosses the bootstrap interface. */
function normalizeModelFlareLabel<T extends CredentialPayload>(payload: T): T {
  return {
    ...payload,
    username: readModelFlareUsername(payload, (value) =>
      typeof value === "string" ? value.trim() : "",
    ),
  }
}

/** Interprets only New API's structured credential-issuance verification outcomes. */
function classifyNewApiCredentialFailure(
  error: unknown,
  stage: CredentialFailureStage,
): CredentialFailure | undefined {
  if (stage !== "completion" || !(error instanceof ApiError)) return undefined
  // rc.22 security proof belongs to the token endpoint, not any generic 403.
  // https://github.com/QuantumNous/new-api/commit/a8729b5c3709cc01d88fc3f2db5b91347fc9129e
  const requiresSecurityProof =
    error.endpoint === "/api/user/token" &&
    error.upstreamCode?.startsWith("SECURITY_PROOF_")
  // rc.41 requires browser step-up verification to issue scoped access tokens.
  // https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.41/service/security_verification.go
  if (
    !requiresSecurityProof &&
    error.code !== API_ERROR_CODES.ACCESS_TOKEN_VERIFICATION_REQUIRED
  )
    return undefined
  return {
    reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
    recoveryAuthType: AuthTypeEnum.AccessToken,
    error: createSafeCredentialError(
      error,
      requiresSecurityProof
        ? "New API dashboard authentication could not be exchanged"
        : "This deployment issues an access token only after a security check",
    ),
  }
}

/** Rix's acquisition 403/404 requires the deployment's sensitive-action verification. */
function classifyRixApiCredentialFailure(
  error: unknown,
  stage: CredentialFailureStage,
): CredentialFailure | undefined {
  // Keep cookie user-info failures separate from the credential issuance path.
  // Rix /api/user/token and /api/user/admin-keys have distinct issuance dialects.
  // Observed 2026-09-26 on https://platform.ephone.ai: the former returns 404,
  // while the latter returns 403 and requires 2FA, a passkey or a bound phone.
  // Upstream: https://github.com/RixAPI/Rix-API
  if (
    stage !== "acquisition" ||
    !(error instanceof ApiError) ||
    (error.statusCode !== 404 && error.statusCode !== 403)
  )
    return undefined
  return {
    reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
    error: createSafeCredentialError(
      error,
      "This deployment issues an access token only to accounts with two-factor authentication, a passkey, or a bound phone number",
    ),
  }
}

const overrides: Partial<
  Record<AccountSiteType, Partial<CredentialImplementation>>
> = {
  [SITE_TYPES.NEW_API]: {
    selectDashboardAuth: (value) =>
      value?.kind === NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND ? value : undefined,
    classifyFailure: classifyNewApiCredentialFailure,
  },
  [SITE_TYPES.MODELFLARE]: {
    fetchUserInfo: async (...args) =>
      normalizeModelFlareLabel(
        await accountBootstrap.defaultAccountBootstrapImplementation.fetchUserInfo(
          ...args,
        ),
      ),
    getOrCreateAccessToken: async (...args) =>
      normalizeModelFlareLabel(
        await accountBootstrap.defaultAccountBootstrapImplementation.getOrCreateAccessToken(
          ...args,
        ),
      ),
    readUsername: readModelFlareUsername,
  },
  [SITE_TYPES.APIYI]: {
    getOrCreateAccessToken: apiyi.getAccessToken,
    missingTokenReason:
      AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
  },
  [SITE_TYPES.LAOZHANG]: {
    // System token issuance needs the site's security proof and reveals the secret once.
    // Cookie onboarding must never rotate or issue a token: /account/profile owns that.
    // LaoZhang v31.1.5: https://api2.laozhang.ai/account/profile
    getOrCreateAccessToken: (request) =>
      accountBootstrap.fetchUserInfo(request),
    missingTokenReason:
      AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
  },
  [SITE_TYPES.RIX_API]: {
    fetchUserInfo: rixApi.fetchUserInfo,
    getOrCreateAccessToken: rixApi.getOrCreateAccessToken,
    classifyFailure: classifyRixApiCredentialFailure,
    observeSiteStatus: (request, status) => {
      if (request.baseUrl)
        recordRixApiMajorVersion(
          request.baseUrl,
          readRixApiMajorVersion(status),
        )
    },
  },
}

/** Binds credential transport, normalization and recovery semantics to one variant. */
export function resolveNewApiAccountCredentialVariant(
  siteType: AccountSiteType,
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
    observeSiteStatus: () => {},
    ...overrides[siteType],
  }
  return {
    fetchUserInfo: implementation.fetchUserInfo,
    getOrCreateAccessToken: implementation.getOrCreateAccessToken,
    selectDashboardAuth: implementation.selectDashboardAuth,
    missingTokenReason: implementation.missingTokenReason,
    observeSiteStatus: implementation.observeSiteStatus,
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
