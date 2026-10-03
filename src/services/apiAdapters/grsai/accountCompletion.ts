import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"
import { grsaiAccountBootstrap } from "./accountBootstrap"

/**
 * Completes Grsai account detection.
 *
 * The console session token is the credential the console API accepts, so
 * completion verifies it against `/client/grsai/getUserInfo` and stores the
 * account id and sign-in email it reports; there is no credential to create.
 */
export const grsaiAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, detected, context } = request

    const candidateToken =
      helpers.trimString(detected.accessToken) ||
      helpers.trimString(request.existingAccessToken)
    if (!candidateToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("grsai access token missing"),
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
      userInfo = await grsaiAccountBootstrap.fetchUserInfo(serviceRequest)
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
    const userId = helpers.trimString(userInfo.id)
    helpers.captureRecoveryData({
      ...(username ? { username } : {}),
      ...(accessToken ? { accessToken } : {}),
      authType: AuthTypeEnum.AccessToken,
    })

    if (!username) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
        new Error("grsai account identity missing"),
      )
    }
    if (!accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("grsai account token missing"),
      )
    }

    let bootstrapFacts = null
    try {
      bootstrapFacts =
        await grsaiAccountBootstrap.loadBootstrapFacts(serviceRequest)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
        error,
      )
    }

    const siteName = await helpers.fetchSiteName(bootstrapFacts)
    helpers.captureRecoveryData({
      siteName,
      exchangeRate: bootstrapFacts?.defaultExchangeRate ?? null,
    })

    // The console runs no check-in flow, so the flag is a product fact rather
    // than a probe result.
    const checkSupport = await grsaiAccountBootstrap
      .fetchCheckInSupport(serviceRequest, bootstrapFacts ?? {})
      .catch(helpers.handleCheckInSupportFetchFailure)

    return {
      username,
      siteName,
      accessToken,
      userId,
      exchangeRate: bootstrapFacts?.defaultExchangeRate ?? null,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        supported: checkSupport ?? false,
      }),
    }
  },
}
