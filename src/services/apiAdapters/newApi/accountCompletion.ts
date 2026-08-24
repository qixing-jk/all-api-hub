import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import { ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"
import { createNewApiAccountBootstrap } from "./accountBootstrap"

const MODERN_AUTH_FRESHNESS_MARGIN_SECONDS = 30
const MODERN_AUTH_INVALID_MESSAGE =
  "New API dashboard authentication is invalid"
const MODERN_AUTH_EXCHANGE_FAILED_MESSAGE =
  "New API dashboard authentication could not be exchanged"

/** Rebuilds a token-free completion error while retaining safe API categories. */
function createModernAuthExchangeError(error: unknown): Error {
  if (!(error instanceof ApiError)) {
    return new Error(MODERN_AUTH_EXCHANGE_FAILED_MESSAGE)
  }

  const safeError = new ApiError(
    MODERN_AUTH_EXCHANGE_FAILED_MESSAGE,
    error.statusCode,
    error.endpoint,
    error.code,
  )
  safeError.originalCode = error.originalCode
  return safeError
}

export const createNewApiAccountCompletion = (
  siteType: AccountSiteType,
): AccountCompletionCapability => ({
  async complete(request, helpers) {
    const { url, requestedAuthType, detected, context } = request
    const modernDashboardAuth =
      siteType === SITE_TYPES.NEW_API &&
      detected.transientAuth?.kind === NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND
        ? detected.transientAuth
        : undefined

    if (modernDashboardAuth) {
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

    const accountBootstrap = modernDashboardAuth
      ? createNewApiAccountBootstrap(siteType, {
          // New API rc.22 regenerates and overwrites the management PAT here,
          // so this dashboard-Bearer exchange must not replay via transports.
          // https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/controller/user.go
          accessTokenCreationPolicy: {
            currentTabTransport: "disabled",
            tempWindowFallback: { statusCodes: [], codes: [] },
          },
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

    const fetchTokenInfo = () => {
      if (modernDashboardAuth) {
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

    const tokenPromise = fetchTokenInfo()

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

    const [tokenInfo, siteStatus, checkSupport, siteName] = await Promise.all([
      tokenPromise.catch((error) => {
        throw helpers.createCompletionError(
          AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
          modernDashboardAuth ? createModernAuthExchangeError(error) : error,
        )
      }),
      siteStatusPromise,
      checkSupportPromise,
      siteStatusPromise.then(helpers.fetchSiteName),
    ])

    const tokenData =
      tokenInfo && typeof tokenInfo === "object"
        ? (tokenInfo as {
            username?: unknown
            access_token?: unknown
            user?: { display_name?: unknown }
          })
        : {}
    const username =
      helpers.trimString(tokenData.username) ||
      // ModelFlare leaves username empty and exposes the account label as
      // display_name in /api/user/self: https://modelflare.dev/
      (siteType === SITE_TYPES.MODELFLARE
        ? helpers.trimString(tokenData.user?.display_name)
        : "")
    const accessToken = helpers.trimString(tokenData.access_token)

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
      siteName,
      accessToken,
      userId: detected.userId.toString(),
      exchangeRate:
        accountBootstrap.extractDefaultExchangeRate(siteStatus) ??
        UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: effectiveAuthType,
      checkIn: helpers.createInitialCheckInConfig({
        supported: checkSupport ?? false,
      }),
    }
  },
})
