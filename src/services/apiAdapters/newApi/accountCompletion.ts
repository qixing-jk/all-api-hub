import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import { NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"
import { createNewApiAccountBootstrap } from "./accountBootstrap"

const MODERN_AUTH_FRESHNESS_MARGIN_SECONDS = 30
const MODERN_AUTH_INVALID_MESSAGE =
  "New API dashboard authentication is invalid"
const MODERN_AUTH_EXCHANGE_FAILED_MESSAGE =
  "New API dashboard authentication could not be exchanged"
const EXISTING_TOKEN_VERIFICATION_FAILED_MESSAGE =
  "Existing account access token could not be verified"
const ACCESS_TOKEN_FETCH_FAILED_MESSAGE =
  "Account access token could not be obtained"

/** Rebuilds a token-free completion error while retaining safe API categories. */
function createSafeCredentialError(error: unknown, message: string): Error {
  if (!(error instanceof ApiError)) {
    return new Error(message)
  }

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

/** Normalizes the provider token payload once for recovery and final validation. */
function normalizeTokenInfo(
  tokenInfo: unknown,
  siteType: AccountSiteType,
  trimString: (value: unknown) => string,
) {
  const tokenData =
    tokenInfo && typeof tokenInfo === "object"
      ? (tokenInfo as {
          username?: unknown
          access_token?: unknown
          user?: { display_name?: unknown }
        })
      : {}

  return {
    username:
      trimString(tokenData.username) ||
      // ModelFlare exposes the account label as display_name in /api/user/self.
      // https://modelflare.dev/
      (siteType === SITE_TYPES.MODELFLARE
        ? trimString(tokenData.user?.display_name)
        : ""),
    accessToken: trimString(tokenData.access_token),
  }
}

export const createNewApiAccountCompletion = (
  siteType: AccountSiteType,
): AccountCompletionCapability => ({
  async complete(request, helpers) {
    const { url, requestedAuthType, existingAccessTokens, detected, context } =
      request
    const modernDashboardAuth =
      siteType === SITE_TYPES.NEW_API &&
      detected.transientAuth?.kind === NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND
        ? detected.transientAuth
        : undefined
    const accessTokenCandidates = [
      ...new Set(
        [...(existingAccessTokens ?? []), detected.accessToken]
          .map(helpers.trimString)
          .filter((token) => token && token !== modernDashboardAuth?.token),
      ),
    ]

    const validateModernDashboardAuth = () => {
      if (!modernDashboardAuth) return
      let targetOrigin: string
      try {
        targetOrigin = new URL(url).origin
      } catch {
        throw helpers.createCompletionError(
          AUTO_DETECT_FAILURE_REASONS.UnexpectedException,
          new Error(MODERN_AUTH_INVALID_MESSAGE),
        )
      }

      if (
        modernDashboardAuth.origin !== targetOrigin ||
        !(
          modernDashboardAuth.expiresAt >
          Math.floor(Date.now() / 1000) + MODERN_AUTH_FRESHNESS_MARGIN_SECONDS
        )
      ) {
        throw helpers.createCompletionError(
          AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
          new Error("New API dashboard authentication is no longer valid"),
        )
      }
    }

    if (!accessTokenCandidates.length) {
      validateModernDashboardAuth()
    }

    const accountBootstrap = modernDashboardAuth
      ? createNewApiAccountBootstrap(siteType, {
          expectedUserId: detected.userId,
        })
      : createNewApiAccountBootstrap(siteType)

    const effectiveAuthType = modernDashboardAuth
      ? AuthTypeEnum.AccessToken
      : requestedAuthType

    const createRequest = (
      auth: Parameters<typeof helpers.createServiceRequest>[0]["auth"],
    ) =>
      helpers.createServiceRequest({
        baseUrl: url,
        auth,
        context,
      })

    const fetchTokenInfo = async () => {
      let verificationError: Error | undefined
      for (const existingAccessToken of accessTokenCandidates) {
        if (effectiveAuthType !== AuthTypeEnum.AccessToken) {
          continue
        }
        try {
          const userInfo = await accountBootstrap.fetchUserInfo(
            createRequest({
              authType: AuthTypeEnum.AccessToken,
              accessToken: existingAccessToken,
              userId: detected.userId,
            }),
          )
          return { ...userInfo, access_token: existingAccessToken }
        } catch (error) {
          // rc.22 distinguishes invalid PATs from disabled users and service failures.
          // https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/middleware/auth.go
          if (
            error instanceof ApiError &&
            error.statusCode === 401 &&
            (!error.upstreamCode || error.upstreamCode === "AUTH_UNAUTHORIZED")
          ) {
            continue
          }
          verificationError ??= helpers.createCompletionError(
            error instanceof ApiError &&
              error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH
              ? AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch
              : AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
            createSafeCredentialError(
              error,
              EXISTING_TOKEN_VERIFICATION_FAILED_MESSAGE,
            ),
          )
        }
      }
      if (verificationError) throw verificationError

      if (modernDashboardAuth) {
        validateModernDashboardAuth()
        // New API rc.22 dashboard Bearers are completion-only; exchange one
        // without New-Api-User and persist only the returned management PAT.
        // https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/docs/authentication.md
        return accountBootstrap.getOrCreateAccessToken(
          createRequest({
            authType: AuthTypeEnum.AccessToken,
            accessToken: modernDashboardAuth.token,
          }),
        )
      }

      if (requestedAuthType === AuthTypeEnum.Cookie) {
        return accountBootstrap.fetchUserInfo(
          createRequest({
            authType: AuthTypeEnum.Cookie,
            userId: detected.userId,
          }),
        )
      }

      if (requestedAuthType === AuthTypeEnum.AccessToken) {
        return accountBootstrap.getOrCreateAccessToken(
          createRequest({
            authType: AuthTypeEnum.Cookie,
            userId: detected.userId,
          }),
        )
      }

      return Promise.resolve(null)
    }

    const tokenPromise = fetchTokenInfo().then((tokenInfo) => {
      const normalizedTokenInfo = normalizeTokenInfo(
        tokenInfo,
        siteType,
        helpers.trimString,
      )
      helpers.captureRecoveryData({
        ...(normalizedTokenInfo.username
          ? { username: normalizedTokenInfo.username }
          : {}),
        ...(normalizedTokenInfo.accessToken
          ? { accessToken: normalizedTokenInfo.accessToken }
          : {}),
        authType: effectiveAuthType,
      })
      return normalizedTokenInfo
    })

    const siteStatusPromise = accountBootstrap
      .fetchSiteStatus(
        createRequest({
          authType: requestedAuthType || AuthTypeEnum.None,
        }),
      )
      .catch((error) => {
        throw helpers.createCompletionError(
          AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
          error,
        )
      })

    const checkSupportPromise = siteStatusPromise.then((siteStatus) =>
      typeof siteStatus?.checkin_enabled === "boolean"
        ? siteStatus.checkin_enabled
        : accountBootstrap
            .fetchCheckInSupport(
              createRequest({
                authType: AuthTypeEnum.None,
              }),
            )
            .catch(helpers.handleCheckInSupportFetchFailure),
    )

    const siteMetadataPromise = siteStatusPromise.then(async (siteStatus) => {
      const exchangeRate =
        accountBootstrap.extractDefaultExchangeRate(siteStatus) ??
        UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
      helpers.captureRecoveryData({ exchangeRate })
      const siteName = await helpers.fetchSiteName(siteStatus)
      helpers.captureRecoveryData({ siteName })
      return { siteName, exchangeRate }
    })

    const [tokenResult, checkSupportResult, siteMetadataResult] =
      await Promise.allSettled([
        tokenPromise.catch((error) => {
          if (error instanceof AutoDetectCompletionError) throw error
          if (
            error instanceof ApiError &&
            error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH
          ) {
            throw helpers.createCompletionError(
              AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
              error,
            )
          }
          // New API requires a dashboard security proof before generating a PAT.
          // Match the token endpoint's structured code, not a generic 403/login error.
          // https://github.com/QuantumNous/new-api/commit/a8729b5c3709cc01d88fc3f2db5b91347fc9129e
          if (
            siteType === SITE_TYPES.NEW_API &&
            error instanceof ApiError &&
            error.endpoint === "/api/user/token" &&
            error.upstreamCode?.startsWith("SECURITY_PROOF_")
          ) {
            helpers.captureRecoveryData({ authType: AuthTypeEnum.AccessToken })
            throw helpers.createCompletionError(
              AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
              createSafeCredentialError(
                error,
                MODERN_AUTH_EXCHANGE_FAILED_MESSAGE,
              ),
            )
          }
          throw helpers.createCompletionError(
            AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
            createSafeCredentialError(
              error,
              modernDashboardAuth
                ? MODERN_AUTH_EXCHANGE_FAILED_MESSAGE
                : ACCESS_TOKEN_FETCH_FAILED_MESSAGE,
            ),
          )
        }),
        checkSupportPromise,
        siteMetadataPromise,
      ])

    if (tokenResult.status === "rejected") {
      throw tokenResult.reason
    }
    if (checkSupportResult.status === "rejected") {
      throw checkSupportResult.reason
    }
    if (siteMetadataResult.status === "rejected") {
      throw siteMetadataResult.reason
    }

    const tokenInfo = tokenResult.value
    const checkSupport = checkSupportResult.value
    const siteMetadata = siteMetadataResult.value

    const { username, accessToken } = tokenInfo

    if (effectiveAuthType === AuthTypeEnum.AccessToken && !accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("Access token is missing"),
      )
    }

    if (!username) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
        new Error("Username is missing"),
      )
    }

    return {
      username,
      siteName: siteMetadata.siteName,
      accessToken,
      userId: detected.userId.toString(),
      exchangeRate: siteMetadata.exchangeRate,
      authType: effectiveAuthType,
      checkIn: helpers.createInitialCheckInConfig({
        supported: checkSupport ?? false,
      }),
    }
  },
})
