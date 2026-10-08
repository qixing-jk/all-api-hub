import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

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
import { type AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import {
  analyzeAutoDetectError,
  AutoDetectErrorType,
  isIdentityKnownAutoDetectFailureReason,
  type AutoDetectError,
} from "~/services/accounts/utils/autoDetectUtils"
import { isCanonicalOpenRouterUrl } from "~/services/accountSiteDefinitions/identifiers"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/inspection"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import {
  resolveProductAnalyticsErrorCategoryFromError,
  type ProductAnalyticsActionInsights,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SITE_TYPES,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsSiteType,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnostics/diagnosticsError"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { createLogger } from "~/utils/core/logger"

const AUTO_DETECT_SLOW_HINT_DELAY_MS = 10_000
const logger = createLogger("AccountDialogHook")
type DetectedAccount = NonNullable<
  Awaited<ReturnType<typeof autoDetectAccount>>["data"]
>

interface DetectionInvocation {
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
    onOpenRouterCredentialCreated: (
      credential: string,
      requestedUrl: string,
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
  const { t, i18n } = useTranslation("accountDialog")
  const [isDetecting, setIsDetecting] = useState(false)
  const [isDetectingSlow, setIsDetectingSlow] = useState(false)
  const [detectionError, setDetectionError] = useState<AutoDetectError | null>(
    null,
  )
  const [attempts] = useState(() => new AccountDetectionAttempts())
  const detectSlowHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const invalidate = useCallback(() => {
    attempts.invalidate()
  }, [attempts])
  useLayoutEffect(() => {
    invalidate()
  }, [isOpen, mode, accountId, invalidate])
  const reset = useCallback(() => {
    invalidate()
    setDetectionError(null)
  }, [invalidate])
  const clearVerificationError = useCallback(() => {
    setDetectionError((current) =>
      current?.type === AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED
        ? null
        : current,
    )
  }, [])
  const requireAccessTokenVerification = useCallback(() => {
    setDetectionError({
      type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
      message: i18n.t("accountDialog:accessTokenVerification.description"),
    })
  }, [i18n])
  useEffect(() => {
    const message = t("accessTokenVerification.description")
    setDetectionError((current) =>
      current?.type ===
        AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED &&
      current.message !== message
        ? { ...current, message }
        : current,
    )
  }, [t])
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
      const checkInDiscoveryTrigger =
        mode === DIALOG_MODES.EDIT || isDetected
          ? "redetect"
          : "initial_detection"
      const createAutoDetectAnalyticsInsights = (
        result?:
          | Awaited<ReturnType<typeof autoDetectAccount>>
          | Awaited<ReturnType<OpenRouterOnboardingStart>>,
        fallbackUsed = false,
      ): ProductAnalyticsActionInsights => {
        const resultData = result && "data" in result ? result.data : undefined
        const autoDetectContext =
          result && "autoDetectContext" in result
            ? result.autoDetectContext ?? resultData?.autoDetectContext
            : resultData?.autoDetectContext
        const candidateSiteType =
          result && "siteType" in result
            ? result.siteType
            : resultData?.siteType ?? autoDetectContext?.siteType
        const analyticsSiteType = isProductAnalyticsSiteType(candidateSiteType)
          ? candidateSiteType
          : undefined
        const attemptOutcome =
          result && "attemptOutcome" in result
            ? result.attemptOutcome
            : undefined
        const checkInSiteType =
          resultData && isAccountSiteType(candidateSiteType)
            ? candidateSiteType
            : undefined
        const candidateMethodIds = checkInSiteType
          ? getAutoCheckinCandidateMethodIds(checkInSiteType, url)
          : []
        const checkInInspection =
          resultData && checkInSiteType
            ? inspectAccountCheckIn({
                config: resultData.checkIn,
                siteType: checkInSiteType,
                siteUrl: url,
              })
            : undefined

        return {
          requestedAuthMode: authType,
          fallbackUsed,
          ...(result &&
          "autoDetectFailureReason" in result &&
          result.success === false
            ? {
                accountAutoDetectIdentityDetected:
                  isIdentityKnownAutoDetectFailureReason(
                    result.autoDetectFailureReason,
                  ),
              }
            : {}),
          ...(checkInInspection
            ? {
                checkInDiscoveryTrigger,
                checkInDiscoveryDecision: checkInInspection.decision.outcome,
                checkInCandidateCount: candidateMethodIds.length,
                checkInSelectionSource: resultData?.checkIn.selection.methodId
                  ? resultData.checkIn.selection.mode
                  : ("none" as const),
              }
            : {}),
          ...(attemptOutcome
            ? { accountAutoDetectAttemptOutcome: attemptOutcome }
            : {}),
          ...(autoDetectContext?.strategy
            ? { autoDetectStrategy: autoDetectContext.strategy }
            : {}),
          ...(autoDetectContext?.fetchContextKind
            ? { fetchContextKind: autoDetectContext.fetchContextKind }
            : {}),
          ...(typeof autoDetectContext?.incognitoContextUsed === "boolean"
            ? {
                incognitoContextUsed: autoDetectContext.incognitoContextUsed,
              }
            : {}),
          ...(typeof autoDetectContext?.currentTabMatched === "boolean"
            ? {
                currentTabMatched: autoDetectContext.currentTabMatched,
              }
            : {}),
          ...(analyticsSiteType ? { siteType: analyticsSiteType } : {}),
        }
      }

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
                      form.onOpenRouterCredentialCreated(
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

            const result = await withProtectionBypassUserCommand(
              PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
              getCurrentTempWindowRequestSource(),
              (protectionBypassExecution) =>
                autoDetectAccount(
                  requestedUrl,
                  authType,
                  protectionBypassExecution,
                  cookieAuthSessionCookie.trim() || undefined,
                  ...(userId.trim() &&
                  (mode === DIALOG_MODES.EDIT ||
                    accessToken.trim() ||
                    cookieAuthSessionCookie.trim() ||
                    sub2apiRefreshToken.trim())
                    ? [
                        {
                          existingAccount: {
                            url: credentialScope?.url || requestedUrl,
                            siteType: credentialScope?.siteType ?? siteType,
                            userId: userId.trim(),
                            accessToken,
                          },
                        },
                      ]
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
              if (
                result.detailedError?.type ===
                AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED
              ) {
                setAuthType(AuthTypeEnum.AccessToken)
              }
              form.enterManual()
              setDetectionError(result.detailedError || null)
              analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
                diagnostics: {
                  failure: {
                    ...buildActionFailureDiagnostics({
                      errorCategory: getAutoDetectAnalyticsErrorCategory(
                        result.detailedError?.type,
                      ),
                      stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
                      reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
                    }),
                    ...(result.autoDetectFailureReason
                      ? {
                          accountAutoDetectFailureReason:
                            result.autoDetectFailureReason,
                        }
                      : {}),
                  },
                },
                insights: {
                  ...createAutoDetectAnalyticsInsights(result, true),
                  ...(result.autoDetectFailureReason
                    ? {
                        accountAutoDetectFailureReason:
                          result.autoDetectFailureReason,
                      }
                    : {}),
                },
              })
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
    state: { isDetecting, isDetectingSlow, detectionError },
    run,
    invalidate,
    reset,
    clearVerificationError,
    requireAccessTokenVerification,
  }
}
/** Maps detection errors onto safe analytics categories. */
function getAutoDetectAnalyticsErrorCategory(
  errorType?: AutoDetectErrorType,
  structuredError?: unknown,
): ProductAnalyticsErrorCategory {
  switch (errorType) {
    case AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED:
    case AutoDetectErrorType.UNAUTHORIZED:
    case AutoDetectErrorType.FORBIDDEN:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
    case AutoDetectErrorType.TIMEOUT:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout
    case AutoDetectErrorType.NETWORK_ERROR:
    case AutoDetectErrorType.SERVER_ERROR:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network
    case AutoDetectErrorType.INVALID_RESPONSE:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
    case AutoDetectErrorType.NOT_FOUND:
    case AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported
    case AutoDetectErrorType.UNKNOWN:
    default:
      if (structuredError !== undefined) {
        return resolveProductAnalyticsErrorCategoryFromError(structuredError)
      }
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
  }
}

/**
 * Checks whether a detected site type is accepted by the analytics whitelist.
 */
function isProductAnalyticsSiteType(
  value: unknown,
): value is ProductAnalyticsSiteType {
  return (
    typeof value === "string" &&
    (PRODUCT_ANALYTICS_SITE_TYPES as readonly string[]).includes(value)
  )
}

/**
 * Resolves the initial flow state for add and edit dialog modes.
 */
