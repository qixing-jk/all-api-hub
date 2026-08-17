import type { Dispatch, RefObject, SetStateAction } from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { normalizeAccountSiteUrlForManagedChannel } from "~/services/accounts/utils/siteUrlNormalization"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountTokenProfileName"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { AccountToken, DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"

const logger = createLogger("TokenVerificationActions")

interface VerificationAction {
  actionId: ProductAnalyticsActionId
  epochRef: RefObject<number>
  getFailureMessage: () => string
  logMessage: string
  setProfile: Dispatch<SetStateAction<ApiCredentialProfile | null>>
}

interface UseTokenVerificationActionsParams {
  account: DisplaySiteData
  enabled: boolean
  token: AccountToken
}

/** Builds the temporary credential profile consumed by verification dialogs. */
function buildTransientVerificationProfile(
  account: DisplaySiteData,
  token: AccountToken,
  resolvedToken: AccountToken,
): ApiCredentialProfile {
  const now = Date.now()

  return {
    id: `account-token:${account.id}:${token.id}`,
    name: buildApiCredentialProfileName({
      accountName: account.name,
      fallbackAccountName: token.accountName,
      tokenName: token.name,
    }),
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    baseUrl: normalizeAccountSiteUrlForManagedChannel({
      siteType: account.siteType,
      url: account.baseUrl,
    }),
    apiKey: resolvedToken.key,
    tagIds: account.tagIds ?? [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  }
}

/** Owns token secret resolution and stale-request protection for verification dialogs. */
export function useTokenVerificationActions({
  account,
  enabled,
  token,
}: UseTokenVerificationActionsParams) {
  const { t } = useTranslation("keyManagement")
  const verificationAllowedRef = useRef(false)
  const verificationGenerationRef = useRef<symbol | null>(null)
  const apiVerificationEpochRef = useRef(0)
  const cliVerificationEpochRef = useRef(0)
  const [verifyingProfile, setVerifyingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [cliVerifyingProfile, setCliVerifyingProfile] =
    useState<ApiCredentialProfile | null>(null)

  useLayoutEffect(() => {
    const verificationGeneration = Symbol("token-verification-generation")
    verificationGenerationRef.current = verificationGeneration
    verificationAllowedRef.current = enabled
    setVerifyingProfile(null)
    setCliVerifyingProfile(null)

    return () => {
      if (verificationGenerationRef.current === verificationGeneration) {
        verificationGenerationRef.current = null
      }
      verificationAllowedRef.current = false
      apiVerificationEpochRef.current += 1
      cliVerificationEpochRef.current += 1
    }
  }, [
    enabled,
    account.authType,
    account.baseUrl,
    account.cookieAuthSessionCookie,
    account.id,
    account.siteType,
    account.token,
    account.userId,
    token.accountId,
    token.id,
    token.key,
  ])

  const isRequestCurrent = (
    verificationGeneration: symbol | null,
    verificationEpoch: number,
    currentVerificationEpoch: number,
  ) =>
    verificationGeneration !== null &&
    verificationAllowedRef.current &&
    verificationGenerationRef.current === verificationGeneration &&
    verificationEpoch === currentVerificationEpoch

  const handleVerification = async ({
    actionId,
    epochRef,
    getFailureMessage,
    logMessage,
    setProfile,
  }: VerificationAction) => {
    const verificationGeneration = verificationGenerationRef.current
    const verificationEpoch = ++epochRef.current
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    let resolvedToken = token

    try {
      resolvedToken = await resolveDisplayAccountTokenForSecret(account, token)
      if (
        !isRequestCurrent(
          verificationGeneration,
          verificationEpoch,
          epochRef.current,
        )
      ) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
          diagnostics: { execution: { staleResponseIgnored: true } },
        })
        return
      }
      setProfile(
        buildTransientVerificationProfile(account, token, resolvedToken),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      if (
        !isRequestCurrent(
          verificationGeneration,
          verificationEpoch,
          epochRef.current,
        )
      ) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
          diagnostics: { execution: { staleResponseIgnored: true } },
        })
        return
      }
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      logger.error(logMessage, {
        message: toSanitizedErrorSummary(
          error,
          [
            token.key,
            resolvedToken.key,
            account.token,
            account.cookieAuthSessionCookie,
          ].filter(Boolean) as string[],
        ),
      })
      showResultToast({
        success: false,
        message: getFailureMessage(),
      })
    }
  }

  const handleVerifyApi = () =>
    handleVerification({
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyAccountTokenApi,
      epochRef: apiVerificationEpochRef,
      getFailureMessage: () => t("keyManagement:messages.verifyApiFailed"),
      logMessage: "Failed to open token API verification",
      setProfile: setVerifyingProfile,
    })

  const handleVerifyCliSupport = () =>
    handleVerification({
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyAccountTokenCliSupport,
      epochRef: cliVerificationEpochRef,
      getFailureMessage: () =>
        t("keyManagement:messages.verifyCliSupportFailed"),
      logMessage: "Failed to open token CLI support verification",
      setProfile: setCliVerifyingProfile,
    })

  return {
    cliVerifyingProfile,
    closeCliVerification: () => setCliVerifyingProfile(null),
    closeVerification: () => setVerifyingProfile(null),
    handleVerifyApi,
    handleVerifyCliSupport,
    verifyingProfile,
  }
}
