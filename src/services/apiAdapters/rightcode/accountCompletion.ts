import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"
import { rightCodeAccountBootstrap } from "./accountBootstrap"

/**
 * Completes Right Code account detection.
 *
 * The console session already carries the bearer token the API accepts, so
 * completion verifies it against `/auth/me` and stores the account's own
 * `user_token` — there is no separate credential-creation step to run.
 */
export const rightCodeAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, detected, context } = request

    const candidateToken =
      helpers.trimString(detected.accessToken) ||
      helpers.trimString(request.existingAccessToken)
    if (!candidateToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("rightcode access token missing"),
      )
    }

    const serviceRequest = helpers.createServiceRequest({
      baseUrl: url,
      context,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: candidateToken,
      },
    })

    let userInfo
    try {
      userInfo = await rightCodeAccountBootstrap.fetchUserInfo(serviceRequest)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }

    const username = helpers.trimString(
      userInfo.username || detected.user?.username,
    )
    const accessToken = helpers.trimString(userInfo.access_token)
    helpers.captureRecoveryData({
      ...(username ? { username } : {}),
      ...(accessToken ? { accessToken } : {}),
      authType: AuthTypeEnum.AccessToken,
    })

    if (!username) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
        new Error("rightcode username missing"),
      )
    }
    if (!accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("rightcode account token missing"),
      )
    }

    let bootstrapFacts = null
    try {
      bootstrapFacts =
        await rightCodeAccountBootstrap.loadBootstrapFacts(serviceRequest)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
        error,
      )
    }

    helpers.captureRecoveryData({
      exchangeRate: bootstrapFacts?.defaultExchangeRate ?? null,
    })

    const siteName = await helpers.fetchSiteName(bootstrapFacts)
    helpers.captureRecoveryData({ siteName })

    // Right Code runs no check-in flow, so the flag is a product fact rather
    // than a probe result.
    const checkSupport = await rightCodeAccountBootstrap
      .fetchCheckInSupport(serviceRequest, bootstrapFacts ?? {})
      .catch(helpers.handleCheckInSupportFetchFailure)

    return {
      username,
      siteName,
      accessToken,
      userId: String(userInfo.id),
      exchangeRate: bootstrapFacts?.defaultExchangeRate ?? null,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        supported: checkSupport ?? false,
      }),
    }
  },
}
