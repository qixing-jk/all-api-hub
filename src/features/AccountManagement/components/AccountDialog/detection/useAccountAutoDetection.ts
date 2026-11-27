import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { AUTO_DETECT_RECOVERY_ACTIONS } from "~/constants/autoDetect"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import {
  AccountDetectionAttempts,
  type AccountDetectionAttempt,
} from "~/features/AccountManagement/components/AccountDialog/detection/accountDetectionAttempts"
import {
  type OpenRouterOnboardingStart,
  type useOpenRouterAccountOnboarding,
} from "~/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding"
import {
  ACCOUNT_CREDENTIAL_VERIFICATION_STATUSES,
  type AccountCredentialVerificationStatus,
  type AccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import notify from "~/lib/notify"
import { autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import {
  analyzeAutoDetectError,
  AutoDetectErrorType,
  isAccessTokenRecoveryError,
  type AutoDetectError,
} from "~/services/accounts/utils/autoDetectUtils"
import {
  isCanonicalAimlApiUrl,
  isCanonicalNovitaUrl,
  isCanonicalOpenRouterUrl,
} from "~/services/accountSiteDefinitions/identifiers"
import {
  isCanonicalRequestyUrl,
  onboardRequestyAccount,
  requestyOnboardingDefaults,
} from "~/services/apiAdapters/requesty/account/accountOnboarding"
import { isNovitaConsoleCredential } from "~/services/apiService/novita/constants"
import {
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnostics/diagnosticsError"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { createLogger } from "~/utils/core/logger"

import {
  buildAutoDetectAnalyticsInsights,
  buildAutoDetectFailureCompletion,
  getAutoDetectAnalyticsErrorCategory,
  type AccountDetectionAnalyticsResult,
} from "./analytics"

const AUTO_DETECT_SLOW_HINT_DELAY_MS = 10_000
const logger = createLogger("AccountDialogHook")
type DetectedAccount = NonNullable<
  Awaited<ReturnType<typeof autoDetectAccount>>["data"]
>

/** Transient evidence for the exact credential and identity accepted by detection. */
export type AccountCredentialVerification = {
  aimlApiKey?: string
  status: AccountCredentialVerificationStatus
  accessToken: string
  siteType: AccountSiteType
  userId: string
  accountLabel?: string
  message?: string
}

interface DetectionInvocation {
  novitaAcquireConsole?: boolean
  novitaVerifyCredential?: boolean
  url: string
  mode: DialogMode
  isDetected: boolean
  draft: AccountDialogDraft
  credentialScope: { url: string; siteType: AccountSiteType } | null
  form: {
    applyDetected: (
      data: DetectedAccount,
      isCurrent: () => boolean,
    ) => Promise<boolean>
    applyRecovery: (
      data: AccountAutoDetectRecoveryData | undefined,
      siteType: AccountSiteType | undefined,
    ) => void
    enterManual: () => void
    setAccessToken: (value: string) => void
    beforeDetect: () => void
    onOpenRouterStarted: () => void
    onManagementKeyCredentialCreated: (
      credential: string,
      requestedUrl: string,
      siteType?: AccountSiteType,
    ) => void
    setAuthType: (value: AuthTypeEnum) => void
  }
  onboarding: Pick<
    ReturnType<typeof useOpenRouterAccountOnboarding>,
    "tryPrepareForStart" | "abandonForOtherAutoDetect"
  >
}

/** Owns detection admission, request generations, progress, errors, and analytics. */
export function useAccountAutoDetection({
  isOpen,
  mode,
  accountId,
}: {
  isOpen: boolean
  mode: DialogMode
  accountId?: string
}) {
  const { t } = useTranslation("accountDialog")
  const [isDetecting, setIsDetecting] = useState(false)
  const [isDetectingSlow, setIsDetectingSlow] = useState(false)
  const [detectionErrorState, setDetectionError] = useState<
    AutoDetectError | typeof AUTO_DETECT_RECOVERY_ACTIONS.AccessToken | null
  >(null)
  // Older handoffs without a failure still use localized generic guidance.
  const detectionError = useMemo<AutoDetectError | null>(
    () =>
      detectionErrorState === AUTO_DETECT_RECOVERY_ACTIONS.AccessToken
        ? {
            type: AutoDetectErrorType.UNKNOWN,
            recoveryAction: AUTO_DETECT_RECOVERY_ACTIONS.AccessToken,
            message: t("accessTokenVerification.description"),
          }
        : detectionErrorState,
    [detectionErrorState, t],
  )
  const [attempts] = useState(() => new AccountDetectionAttempts())
  const [credentialVerification, setCredentialVerification] =
    useState<AccountCredentialVerification | null>(null)
  const [novitaCredentialOperation, setNovitaCredentialOperation] = useState<
    "console" | "api-key" | "account" | undefined
  >()
  const detectSlowHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const invalidate = useCallback(() => {
    attempts.invalidate()
    setCredentialVerification(null)
    setNovitaCredentialOperation(undefined)
  }, [attempts])
  useLayoutEffect(() => {
    invalidate()
  }, [isOpen, mode, accountId, invalidate])
  const reset = useCallback(() => {
    invalidate()
    setDetectionError(null)
  }, [invalidate])
  const clearAccessTokenRecovery = useCallback(() => {
    setDetectionError((current) =>
      current === AUTO_DETECT_RECOVERY_ACTIONS.AccessToken ||
      isAccessTokenRecoveryError(current)
        ? null
        : current,
    )
  }, [])
  const requireAccessTokenRecovery = useCallback(
    (error?: Pick<AutoDetectError, "type" | "message">) => {
      setDetectionError(
        error
          ? {
              ...error,
              recoveryAction: AUTO_DETECT_RECOVERY_ACTIONS.AccessToken,
              canUseApiCredentialFallback: false,
            }
          : AUTO_DETECT_RECOVERY_ACTIONS.AccessToken,
      )
    },
    [],
  )
  useEffect(
    () => () => {
      invalidate()
    },
    [invalidate],
  )
  useEffect(() => {
    if (!isDetecting) {
      setIsDetectingSlow(false)
      if (detectSlowHintTimeoutRef.current) {
        clearTimeout(detectSlowHintTimeoutRef.current)
        detectSlowHintTimeoutRef.current = null
      }
      return
    }

    setIsDetectingSlow(false)
    detectSlowHintTimeoutRef.current = setTimeout(() => {
      setIsDetectingSlow(true)
    }, AUTO_DETECT_SLOW_HINT_DELAY_MS)

    return () => {
      if (detectSlowHintTimeoutRef.current) {
        clearTimeout(detectSlowHintTimeoutRef.current)
        detectSlowHintTimeoutRef.current = null
      }
    }
  }, [isDetecting])

  const run = async (input: DetectionInvocation) => {
    const { url, mode, isDetected, draft, credentialScope, form, onboarding } =
      input
    const {
      authType,
      siteType,
      accessToken,
      userId,
      cookieAuthSessionCookie,
      sub2apiRefreshToken,
    } = draft
    const { setAccessToken, setAuthType } = form
    const {
      tryPrepareForStart: tryPrepareOpenRouterOnboardingStart,
      abandonForOtherAutoDetect: abandonOpenRouterOnboardingForOtherAutoDetect,
    } = onboarding
    const runAdmittedAutoDetectInvocation = async (
      attempt: AccountDetectionAttempt,
      startOpenRouterOnboarding?: OpenRouterOnboardingStart,
    ) => {
      const requestedUrl = url.trim()
      const isCurrentAutoDetectRun = attempt.isCurrent
      const analyticsAction = attempt.beginDetection()
      const createAutoDetectAnalyticsInsights = (
        result?: AccountDetectionAnalyticsResult,
        fallbackUsed = false,
      ) =>
        buildAutoDetectAnalyticsInsights(
          { mode, isDetected, authType, url },
          result,
          fallbackUsed,
        )

      if (!requestedUrl) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
          insights: createAutoDetectAnalyticsInsights(),
        })
        return
      }

      if (!startOpenRouterOnboarding) {
        const { clearCreatedCredential } =
          abandonOpenRouterOnboardingForOtherAutoDetect()
        if (clearCreatedCredential) setAccessToken("")
      }
      setIsDetecting(true)
      setNovitaCredentialOperation(
        input.novitaAcquireConsole
          ? "console"
          : input.novitaVerifyCredential
            ? "api-key"
            : "account",
      )
      setCredentialVerification(null)
      setDetectionError(null)
      form.beforeDetect()

      await attempt.withPopup(
        async () => {
          try {
            if (!isCurrentAutoDetectRun()) {
              analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
                insights: createAutoDetectAnalyticsInsights(),
              })
              return
            }
            if (startOpenRouterOnboarding) {
              let onboardingError: unknown
              let shouldShowDetectionError = false
              const outcome = await withProtectionBypassUserCommand(
                PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
                getCurrentTempWindowRequestSource(),
                (protectionBypassExecution) =>
                  startOpenRouterOnboarding({
                    protectionBypassExecution,
                    onStarted: () => {
                      if (!isCurrentAutoDetectRun()) return
                      form.onOpenRouterStarted()
                      // The admitted provider workflow owns its initial site/URL
                      // normalization; subsequent user changes still invalidate it.
                      attempt.acceptNormalization()
                    },
                    onCredentialCreated: (credential) => {
                      form.onManagementKeyCredentialCreated(
                        credential,
                        requestedUrl,
                      )
                    },
                    onManualFallback: (failure) => {
                      onboardingError = failure.error
                      shouldShowDetectionError = failure.showDetectionError
                      if (failure.showDetectionError) {
                        setDetectionError(
                          failure.error
                            ? analyzeAutoDetectError(failure.error)
                            : {
                                type: AutoDetectErrorType.UNKNOWN,
                                message: failure.message ?? "",
                              },
                        )
                      }
                      form.enterManual()
                    },
                    onDetected: async (resultData) => {
                      await form.applyDetected(
                        resultData,
                        isCurrentAutoDetectRun,
                      )
                    },
                  }),
              )

              if (outcome.status === "cancelled_before_dispatch") {
                analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
                  insights: createAutoDetectAnalyticsInsights(outcome, false),
                })
                return
              }
              if (outcome.status === "ignored") {
                analyticsAction.complete(
                  outcome.success
                    ? PRODUCT_ANALYTICS_RESULTS.Success
                    : PRODUCT_ANALYTICS_RESULTS.Failure,
                  {
                    insights: createAutoDetectAnalyticsInsights(outcome, false),
                  },
                )
                return
              }
              if (outcome.status === "completed") {
                analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
                  insights: createAutoDetectAnalyticsInsights(outcome, false),
                })
                return
              }

              analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
                ...(shouldShowDetectionError && onboardingError
                  ? {
                      diagnostics: {
                        failure: buildActionFailureDiagnostics({
                          error: onboardingError,
                          errorCategory: getAutoDetectAnalyticsErrorCategory(
                            analyzeAutoDetectError(onboardingError).type,
                            onboardingError,
                          ),
                          stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
                        }),
                      },
                    }
                  : {}),
                insights: createAutoDetectAnalyticsInsights(outcome, true),
              })
              return
            }

            const requestyOnboarding = isCanonicalRequestyUrl(requestedUrl)
            if (requestyOnboarding) {
              form.applyRecovery(
                {
                  siteType: requestyOnboardingDefaults.siteType,
                  authType: AuthTypeEnum.AccessToken,
                },
                requestyOnboardingDefaults.siteType,
              )
              attempt.acceptNormalization()
            }
            const result = await withProtectionBypassUserCommand(
              PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
              getCurrentTempWindowRequestSource(),
              (protectionBypassExecution) =>
                requestyOnboarding
                  ? onboardRequestyAccount({
                      accessToken:
                        !credentialScope ||
                        (isCanonicalRequestyUrl(credentialScope.url) &&
                          credentialScope.siteType ===
                            requestyOnboardingDefaults.siteType)
                          ? accessToken
                          : undefined,
                      protectionBypassExecution,
                      onCredentialCreated: (credential) => {
                        if (!isCurrentAutoDetectRun()) {
                          notify.warning(
                            t("form.autoCreateAccessTokenUnconfirmed"),
                          )
                          return
                        }
                        form.onManagementKeyCredentialCreated(
                          credential,
                          requestedUrl,
                          requestyOnboardingDefaults.siteType,
                        )
                      },
                    })
                  : autoDetectAccount(
                      requestedUrl,
                      authType,
                      protectionBypassExecution,
                      cookieAuthSessionCookie.trim() || undefined,
                      ...((userId.trim() ||
                        (isCanonicalAimlApiUrl(requestedUrl) &&
                          accessToken.trim()) ||
                        (isCanonicalNovitaUrl(requestedUrl) &&
                          (accessToken.trim() ||
                            input.novitaAcquireConsole ||
                            draft.novitaCredentialMode === "api-key"))) &&
                      (mode === DIALOG_MODES.EDIT ||
                        accessToken.trim() ||
                        cookieAuthSessionCookie.trim() ||
                        sub2apiRefreshToken.trim() ||
                        input.novitaAcquireConsole ||
                        draft.novitaCredentialMode === "api-key")
                        ? [
                            {
                              allowCredentialCreation:
                                isCanonicalAimlApiUrl(requestedUrl) &&
                                !accessToken.trim(),
                              existingAccount: {
                                url: credentialScope?.url || requestedUrl,
                                siteType: credentialScope?.siteType ?? siteType,
                                userId: userId.trim(),
                                accessToken,
                                aimlApiKey: draft.aimlApiKey,
                                novitaCredentialMode: input.novitaAcquireConsole
                                  ? ("console" as const)
                                  : input.novitaVerifyCredential
                                    ? ("api-key" as const)
                                    : undefined,
                              },
                            },
                          ]
                        : isCanonicalAimlApiUrl(requestedUrl)
                          ? [{ allowCredentialCreation: !accessToken.trim() }]
                          : []),
                    ),
            )
            if (!isCurrentAutoDetectRun()) {
              analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
                insights: createAutoDetectAnalyticsInsights(result, false),
              })
              return
            }
            if (!result.success) {
              form.applyRecovery(
                result.recoveryData,
                result.autoDetectContext?.siteType,
              )
              if (isAccessTokenRecoveryError(result.detailedError)) {
                setAuthType(AuthTypeEnum.AccessToken)
              }
              form.enterManual()
              setDetectionError(result.detailedError || null)
              if (accessToken.trim())
                setCredentialVerification({
                  status: ACCOUNT_CREDENTIAL_VERIFICATION_STATUSES.Error,
                  accessToken,
                  siteType,
                  userId,
                  message: result.detailedError?.message || result.message,
                })
              const completion = buildAutoDetectFailureCompletion(
                result,
                createAutoDetectAnalyticsInsights(result, true),
              )
              analyticsAction.complete(completion.result, completion.options)
              return
            }

            const resultData = result.data
            if (resultData) {
              const applied = await form.applyDetected(
                resultData,
                isCurrentAutoDetectRun,
              )
              if (!applied) {
                analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
                  insights: createAutoDetectAnalyticsInsights(result, false),
                })
                return
              }
              if (
                draft.authType === AuthTypeEnum.Cookie &&
                resultData.authType === AuthTypeEnum.AccessToken
              ) {
                notify.info(t("messages.authTypeChangedToAccessToken"))
              }
              setNovitaCredentialOperation(
                input.novitaVerifyCredential
                  ? "api-key"
                  : isNovitaConsoleCredential(resultData.accessToken)
                    ? "console"
                    : "api-key",
              )
              setCredentialVerification({
                status: ACCOUNT_CREDENTIAL_VERIFICATION_STATUSES.Success,
                aimlApiKey: resultData.aimlApiAuth?.apiKey ?? draft.aimlApiKey,
                accessToken: resultData.accessToken,
                siteType: isAccountSiteType(resultData.siteType)
                  ? resultData.siteType
                  : siteType,
                userId: resultData.userId,
                accountLabel: resultData.username || resultData.userId,
              })
              // Requesty onboarding reports credential reuse instead of a plain
              // detection success; surface that so the extra key is explained.
              if (
                requestyOnboarding &&
                typeof result.message === "string" &&
                result.message !== t("messages.autoDetectSuccess")
              ) {
                notify.info(result.message)
              }
              analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
                insights: createAutoDetectAnalyticsInsights(result, false),
              })
            }
          } catch (error) {
            if (!isCurrentAutoDetectRun()) {
              analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
                insights: createAutoDetectAnalyticsInsights(undefined, false),
              })
              return
            }
            logger.error("Auto-detect failed", {
              error,
              url: url.trim(),
              authType,
            })
            const detectionError = analyzeAutoDetectError(error)
            setDetectionError(detectionError)
            if (accessToken.trim())
              setCredentialVerification({
                status: ACCOUNT_CREDENTIAL_VERIFICATION_STATUSES.Error,
                accessToken,
                siteType,
                userId,
                message: detectionError.message,
              })
            form.enterManual()
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              diagnostics: {
                failure: buildActionFailureDiagnostics({
                  error,
                  errorCategory: getAutoDetectAnalyticsErrorCategory(
                    detectionError.type,
                    error,
                  ),
                  stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
                }),
              },
              insights: createAutoDetectAnalyticsInsights(undefined, true),
            })
          }
        },
        async (error) => {
          if (!isCurrentAutoDetectRun()) {
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, {
              insights: createAutoDetectAnalyticsInsights(),
            })
            setIsDetecting(false)
            return
          }
          logger.error("Failed to prepare popup auto-detect flow", { error })
          const detectionError = analyzeAutoDetectError(error)
          setDetectionError(detectionError)
          analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            diagnostics: {
              failure: buildActionFailureDiagnostics({
                error,
                errorCategory: getAutoDetectAnalyticsErrorCategory(
                  detectionError.type,
                  error,
                ),
                stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
              }),
            },
            insights: createAutoDetectAnalyticsInsights(undefined, true),
          })
          setIsDetecting(false)
          if (startOpenRouterOnboarding) return
          throw error
        },
        () => setIsDetecting(false),
      )
    }

    const runAutoDetectInvocation = async (
      attempt: AccountDetectionAttempt,
    ) => {
      if (!isCanonicalOpenRouterUrl(url.trim())) {
        return runAdmittedAutoDetectInvocation(attempt)
      }
      const admission = tryPrepareOpenRouterOnboardingStart()
      if (!admission) return
      return admission.preparation.run(async (start) => {
        if (admission.clearCreatedCredential) setAccessToken("")
        await runAdmittedAutoDetectInvocation(attempt, start)
      })
    }

    await attempts.run(runAutoDetectInvocation)
  }

  return {
    state: {
      isDetecting,
      isDetectingSlow,
      detectionError,
      credentialVerification,
      novitaCredentialOperation,
    },
    run,
    invalidate,
    reset,
    clearAccessTokenRecovery,
    requireAccessTokenRecovery,
  }
}
