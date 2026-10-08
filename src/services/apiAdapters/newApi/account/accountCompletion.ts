import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import type { AccountSiteType } from "~/constants/siteType"
import { isAgentRouterLoginUrl } from "~/services/accountLogin/providers/agentrouter/config"
import { AutoDetectCompletionError } from "~/services/accounts/autoDetectCompletion/types"
import type { AccountCompletionCapability } from "~/services/apiAdapters/contracts/accountCompletion"
import { createNewApiAccountBootstrap } from "~/services/apiAdapters/newApi/account/accountBootstrap"
import {
  createSafeCredentialError,
  resolveNewApiAccountCredentialVariant,
} from "~/services/apiAdapters/newApi/account/accountCredentialVariant"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const MODERN_AUTH_FRESHNESS_MARGIN_SECONDS = 30
const MODERN_AUTH_INVALID_MESSAGE =
  "New API dashboard authentication is invalid"
const EXISTING_TOKEN_VERIFICATION_FAILED_MESSAGE =
  "Existing account access token could not be verified"

export const createNewApiAccountCompletion = (
  siteType: AccountSiteType,
): AccountCompletionCapability => ({
  async complete(request, helpers) {
    const credentials = resolveNewApiAccountCredentialVariant(siteType)
    const {
      url,
      requestedAuthType,
      existingAccessToken,
      loadSavedAccessTokens,
      detected,
      context,
    } = request
    const modernDashboardAuth = credentials.selectDashboardAuth(
      detected.transientAuth,
    )
    const knownAccessTokens = [existingAccessToken, detected.accessToken]
      .map(helpers.trimString)
      .filter((token) => token && token !== modernDashboardAuth?.token)

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

    if (!knownAccessTokens.length && !loadSavedAccessTokens) {
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
      if (effectiveAuthType === AuthTypeEnum.AccessToken) {
        const checkedTokens = new Set<string>()
        const tryReuseAccessToken = async (candidate: string) => {
          const accessToken = helpers.trimString(candidate)
          if (
            !accessToken ||
            accessToken === modernDashboardAuth?.token ||
            checkedTokens.has(accessToken)
          )
            return
          checkedTokens.add(accessToken)
          try {
            const userInfo = await accountBootstrap.fetchUserInfo(
              createRequest({
                authType: AuthTypeEnum.AccessToken,
                accessToken,
                userId: detected.userId,
              }),
            )
            return { ...userInfo, access_token: accessToken }
          } catch (error) {
            // rc.22 distinguishes invalid PATs from disabled users and service failures.
            // https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/middleware/auth.go
            if (
              error instanceof ApiError &&
              error.statusCode === 401 &&
              (!error.upstreamCode ||
                error.upstreamCode === "AUTH_UNAUTHORIZED")
            ) {
              return
            }
            throw helpers.createCompletionError(
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

        for (const accessToken of knownAccessTokens) {
          const tokenInfo = await tryReuseAccessToken(accessToken)
          if (tokenInfo) return tokenInfo
        }
        for (const accessToken of (await loadSavedAccessTokens?.()) ?? []) {
          const tokenInfo = await tryReuseAccessToken(accessToken)
          if (tokenInfo) return tokenInfo
        }
      }

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
        try {
          return await accountBootstrap.getOrCreateAccessToken(
            createRequest({
              authType: AuthTypeEnum.Cookie,
              userId: detected.userId,
            }),
          )
        } catch (error) {
          const failure = credentials.interpretAcquisitionFailure(error)
          if (!failure) throw error
          throw helpers.createCompletionError(failure.reason, failure.error)
        }
      }

      return Promise.resolve(null)
    }

    const tokenPromise = fetchTokenInfo().then((tokenInfo) => {
      const normalizedTokenInfo = credentials.normalizeTokenInfo(
        tokenInfo,
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

    const bootstrapFactsPromise = accountBootstrap
      .loadBootstrapFacts(
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

    const checkSupportPromise = bootstrapFactsPromise.then((bootstrapFacts) =>
      accountBootstrap
        .fetchCheckInSupport(
          createRequest({
            authType: AuthTypeEnum.None,
          }),
          bootstrapFacts,
        )
        .catch(helpers.handleCheckInSupportFetchFailure),
    )

    const siteMetadataPromise = bootstrapFactsPromise.then(
      async (bootstrapFacts) => {
        const exchangeRate =
          bootstrapFacts?.defaultExchangeRate ?? DEFAULT_USD_TO_CNY_RATE
        helpers.captureRecoveryData({ exchangeRate })
        const siteName = await helpers.fetchSiteName(bootstrapFacts)
        helpers.captureRecoveryData({ siteName })
        return { siteName, exchangeRate }
      },
    )

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
          const failure = credentials.interpretCompletionFailure(
            error,
            Boolean(modernDashboardAuth),
          )
          if (failure.recoveryAuthType)
            helpers.captureRecoveryData({
              authType: failure.recoveryAuthType,
            })
          throw helpers.createCompletionError(failure.reason, failure.error)
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
        credentials.missingTokenReason,
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
        // AgentRouter grants the check-in benefit during a fresh OAuth login
        // that reuses whichever GitHub / Linux DO identity the browser holds.
        // One proven binding therefore preselects the provider; two bindings or
        // none stay unselected instead of guessing GitHub.
        ...(isAgentRouterLoginUrl(url) && tokenInfo.loginProviders.length === 1
          ? { loginCheckInProvider: tokenInfo.loginProviders[0] }
          : {}),
      }),
    }
  },
})
