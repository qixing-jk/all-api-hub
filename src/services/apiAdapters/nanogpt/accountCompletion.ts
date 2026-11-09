import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import type { AccountCompletionCapability } from "~/services/apiAdapters/contracts/accountCompletion"
import { nanoGptAccountBootstrap } from "~/services/apiAdapters/nanogpt/accountBootstrap"
import { fetchNanoGptBalance } from "~/services/apiService/nanogpt"
import { parseNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"
import {
  nanoGptManagementIdentity,
  verifyNanoGptManagementCredential,
} from "~/services/apiService/nanogpt/managementIdentity"
import { AuthTypeEnum } from "~/types"

/** Console session field carrying the same account anchor the key returns. */
const DETECTED_DEPOSIT_ADDRESS_FIELD = "nanoDepositAddress"

/**
 * Completes a NanoGPT account from a pasted inference API key.
 *
 * The saved credential is the key; the browser console session only supplies
 * the display name and a second copy of the account's Nano deposit address,
 * which lets this step prove the key belongs to the account that is signed in.
 * Key creation needs an email step-up challenge, so this flow never issues or
 * replaces a credential.
 * https://docs.nano-gpt.com/api-reference/endpoint/check-balance
 */
export const nanoGptAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const { url, detected, context } = request

    const candidateToken =
      helpers.trimString(detected.accessToken) ||
      helpers.trimString(request.existingAccessToken)

    const serviceRequest = helpers.createServiceRequest({
      baseUrl: url,
      context,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: candidateToken,
      },
    })

    // Static provider facts must also reach the incomplete draft: otherwise
    // pasting the missing key leaves the required exchange rate empty.
    let bootstrapFacts
    try {
      bootstrapFacts =
        await nanoGptAccountBootstrap.loadBootstrapFacts(serviceRequest)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
        error,
      )
    }

    const exchangeRate =
      bootstrapFacts?.defaultExchangeRate ?? DEFAULT_USD_TO_CNY_RATE
    helpers.captureRecoveryData({ exchangeRate })
    const siteName = await helpers.fetchSiteName(bootstrapFacts)
    helpers.captureRecoveryData({ siteName })

    if (!candidateToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("nanogpt inference API key missing"),
      )
    }

    const pair = parseNanoGptCredentials(candidateToken)
    if (!pair.apiKey && !pair.managementToken)
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("NanoGPT credential missing"),
      )
    if (pair.managementToken) {
      try {
        await verifyNanoGptManagementCredential(serviceRequest)
      } catch (error) {
        throw helpers.createCompletionError(
          AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
          error,
        )
      }
    }
    if (!pair.apiKey) {
      const userId = await nanoGptManagementIdentity(serviceRequest)
      const username = helpers.trimString(
        (detected.user as Record<string, unknown> | undefined)?.username,
      )
      helpers.captureRecoveryData({
        userId,
        accessToken: candidateToken,
        authType: AuthTypeEnum.AccessToken,
        username,
      })
      return {
        username,
        siteName,
        accessToken: candidateToken,
        userId,
        exchangeRate,
        authType: AuthTypeEnum.AccessToken,
        checkIn: helpers.createInitialCheckInConfig({ supported: false }),
      }
    }

    let balance
    try {
      balance = await fetchNanoGptBalance(serviceRequest)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }

    const detectedDepositAddress = helpers.trimString(
      (detected.user as Record<string, unknown> | undefined)?.[
        DETECTED_DEPOSIT_ADDRESS_FIELD
      ],
    )
    if (
      detectedDepositAddress &&
      detectedDepositAddress !== balance.depositAddress
    ) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
        new Error("nanogpt key does not belong to the signed-in account"),
      )
    }

    const username = helpers.trimString(
      (detected.user as Record<string, unknown> | undefined)?.username ||
        (detected.user as Record<string, unknown> | undefined)?.name ||
        (detected.user as Record<string, unknown> | undefined)?.email,
    )
    helpers.captureRecoveryData({
      userId: balance.depositAddress,
      accessToken: candidateToken,
      authType: AuthTypeEnum.AccessToken,
      ...(username ? { username } : {}),
    })

    const checkSupport = await nanoGptAccountBootstrap
      .fetchCheckInSupport(serviceRequest, bootstrapFacts ?? {})
      .catch(helpers.handleCheckInSupportFetchFailure)

    return {
      username,
      siteName,
      accessToken: candidateToken,
      // The Nano deposit address is the identity this credential can prove, so
      // it is what later refreshes and duplicate matching compare against.
      userId: balance.depositAddress,
      exchangeRate,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        supported: Boolean(checkSupport),
      }),
    }
  },
}
