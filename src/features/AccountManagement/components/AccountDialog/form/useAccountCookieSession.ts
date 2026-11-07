import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { ACCOUNT_COOKIE_VALIDATION_STATUS } from "~/constants/accountCookieValidation"
import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { type DialogMode } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { startAccountDialogAnalyticsAction } from "~/features/AccountManagement/components/AccountDialog/analytics"
import toast from "~/lib/notify"
import { supportsAccountCookieRecovery } from "~/services/accountCredentialRecovery/policy"
import {
  getAccountCookieRecoveryMessage,
  type AccountCookieRecoveryResult,
} from "~/services/accountCredentialRecovery/result"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import { isAccountLoginConfigured } from "~/services/accountLogin/configCodec"
import { validateAccountCookie } from "~/services/accounts/cookieValidation"
import type {
  AccountCookieValidationEvidence,
  AccountCookieValidationTarget,
} from "~/services/apiAdapters/contracts/accountLogin"
import { API_TRANSPORT_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnostics/diagnosticsError"
import {
  createUserCommandProtectionBypassExecution,
  withProtectionBypassUserCommand,
} from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { type AuthTypeEnum } from "~/types"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

import { useAccountCookiePermissions } from "./useAccountCookiePermissions"

interface CookieImportResponse {
  success?: boolean
  data?: string
  error?: string
  errorCode?: string
  cookieStoreId?: string
}

const logger = createLogger("AccountDialogHook")

type CookieImportContext = {
  cookieStoreId?: string
  sourceTabId?: number
  sourceTabIncognito?: boolean
}

/** Owns cookie import requests, permission feedback, and stale-result rejection. */
export function useAccountCookieSession({
  isOpen,
  mode,
  accountId,
  url,
  authType,
  getContext,
  applyCookie,
  validationTarget,
}: {
  isOpen: boolean
  mode: DialogMode
  accountId?: string
  url: string
  authType: AuthTypeEnum
  getContext: (url: string) => CookieImportContext
  applyCookie: (value: string) => void
  validationTarget?: AccountCookieValidationTarget
}) {
  const { t } = useTranslation("accountDialog")
  const [isImportingCookies, setIsImportingCookies] = useState(false)
  const [verifiedCookie, setVerifiedCookie] =
    useState<AccountCookieValidationEvidence | null>(null)
  const [isRecoveringCookies, setIsRecoveringCookies] = useState(false)
  const recoveryGeneration = useRef(0)
  const activeRecovery = useRef<string | null>(null)
  const importValidation = useRef<AbortController | null>(null)
  const [showCookiePermissionWarning, setShowCookiePermissionWarning] =
    useState(false)
  const {
    state: cookieAuthPermissionState,
    invalidate: invalidatePermissions,
    requestPermissions: handleRequestCookieAuthPermissions,
  } = useAccountCookiePermissions({ isOpen, authType })
  const importGeneration = useRef(0)
  const cancelRecovery = useCallback(() => {
    const requestId = activeRecovery.current
    activeRecovery.current = null
    if (requestId)
      void sendRuntimeMessage(
        {
          action: RuntimeActionIds.AccountDialogCancelCookieRecovery,
          requestId,
        },
        { maxAttempts: 1 },
      ).catch(() => {})
  }, [])
  const invalidate = useCallback(() => {
    importGeneration.current += 1
    recoveryGeneration.current += 1
    cancelRecovery()
    importValidation.current?.abort()
    invalidatePermissions()
    setIsImportingCookies(false)
    setVerifiedCookie(null)
    setIsRecoveringCookies(false)
  }, [cancelRecovery, invalidatePermissions])
  const reset = useCallback(() => {
    invalidate()
    setShowCookiePermissionWarning(false)
  }, [invalidate])
  useLayoutEffect(() => {
    invalidate()
  }, [
    isOpen,
    mode,
    accountId,
    url,
    authType,
    validationTarget?.site_type,
    validationTarget?.account_info.id,
    validationTarget?.login?.methodId,
    validationTarget?.login?.credentials?.username,
    validationTarget?.login?.credentials?.password,
    validationTarget?.login?.automaticRecovery,
    invalidate,
  ])
  useEffect(
    () => () => {
      cancelRecovery()
      importGeneration.current += 1
      recoveryGeneration.current += 1
      importValidation.current?.abort()
    },
    [cancelRecovery],
  )
  useLayoutEffect(() => {
    const currentCookie = validationTarget?.cookieAuth?.sessionCookie
    if (currentCookie === undefined) return
    importGeneration.current += 1
    recoveryGeneration.current += 1
    importValidation.current?.abort()
    cancelRecovery()
    setIsImportingCookies(false)
    setIsRecoveringCookies(false)
    if (currentCookie !== verifiedCookie?.cookie) setVerifiedCookie(null)
  }, [
    validationTarget?.cookieAuth?.sessionCookie,
    verifiedCookie,
    cancelRecovery,
  ])

  const readCookies = async ({
    source,
    isCurrent = () => true,
  }: {
    source: "manual" | "automatic"
    isCurrent?: () => boolean
  }) => {
    const generation = ++importGeneration.current
    const ownsRequest = () => generation === importGeneration.current
    const current = () => ownsRequest() && isCurrent()
    setIsImportingCookies(source === "manual")
    let sourceContext: CookieImportContext = {}
    try {
      sourceContext = getContext(url.trim())
      const response = await sendRuntimeMessage<CookieImportResponse>({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: url.trim(),
        ...sourceContext,
      })
      return {
        current: current(),
        response,
        sourceContext,
        failed: false,
        error: undefined as unknown,
      }
    } catch (error) {
      return {
        current: current(),
        response: undefined,
        sourceContext,
        failed: true,
        error,
      }
    } finally {
      if (ownsRequest()) setIsImportingCookies(false)
    }
  }

  const handleImportCookieAuthSessionCookie = async () => {
    if (activeRecovery.current) return
    importValidation.current?.abort()
    const generation = importGeneration.current + 1
    const analyticsAction = startAccountDialogAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountCookies,
    )

    if (!url.trim()) {
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      toast.error(t("messages.urlRequired"))
      return
    }
    try {
      const completion = await readCookies({ source: "manual" })
      if (!completion.current) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      if (completion.failed) throw completion.error
      const response = completion.response
      if (response?.success && response.data) {
        if (
          validationTarget?.site_type &&
          supportsAccountCookieRecovery(validationTarget) &&
          String(validationTarget.account_info.id ?? "").trim()
        ) {
          setIsImportingCookies(true)
          const controller = new AbortController()
          importValidation.current = controller
          const source = getCurrentTempWindowRequestSource()
          const sourceContext = completion.sourceContext
          const cookieStoreId =
            response.cookieStoreId ?? sourceContext.cookieStoreId
          const verification = await withProtectionBypassUserCommand(
            PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
            source,
            (protectionBypassExecution) =>
              validateAccountCookie({
                ...validationTarget,
                site_url: url,
                cookieAuth: { sessionCookie: response.data! },
                protectionBypassExecution,
                tempWindowRequestSource: source,
                abortSignal: controller.signal,
                ...(cookieStoreId || sourceContext.sourceTabIncognito
                  ? {
                      fetchContext: {
                        kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
                        ...(cookieStoreId ? { cookieStoreId } : {}),
                        ...(sourceContext.sourceTabIncognito
                          ? { incognito: true }
                          : {}),
                      },
                    }
                  : {}),
              }),
          )
          if (generation !== importGeneration.current) {
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
            return
          }
          if (verification.status !== ACCOUNT_COOKIE_VALIDATION_STATUS.Valid) {
            toast.error(
              verification.status ===
                ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch
                ? t("cookieValidation.importIdentityMismatch")
                : verification.status ===
                    ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid
                  ? t("cookieValidation.importInvalid")
                  : t("cookieValidation.importUnconfirmed"),
            )
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure)
            return
          }
          setVerifiedCookie({
            cookie: response.data,
            siteUrl: url,
            siteType: validationTarget.site_type,
            userId: String(validationTarget.account_info.id).trim(),
          })
        }
        applyCookie(response.data)
        setShowCookiePermissionWarning(false)
        toast.success(t("messages.importCookiesSuccess"))
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      } else {
        setShowCookiePermissionWarning(false)

        if (!response?.errorCode) {
          analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            diagnostics: {
              failure: buildActionFailureDiagnostics({
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
                stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Response,
                reason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
              }),
            },
          })
          toast.error(
            response?.error
              ? t("messages.importCookiesFailed", { error: response.error })
              : t("messages.importCookiesEmpty"),
          )
          return
        }

        switch (response.errorCode) {
          case COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied:
            setShowCookiePermissionWarning(true)
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              diagnostics: {
                failure: buildActionFailureDiagnostics({
                  errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
                  stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Permission,
                  reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PermissionDenied,
                }),
              },
            })
            toast.error(t("messages.importCookiesPermissionDenied"))
            break
          case COOKIE_IMPORT_FAILURE_REASONS.ReadFailed:
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              diagnostics: {
                failure: buildActionFailureDiagnostics({
                  errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
                  stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
                  reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
                }),
              },
            })
            toast.error(
              response.error
                ? t("messages.importCookiesFailed", { error: response.error })
                : t("messages.importCookiesFailedUnknown"),
            )
            break
          case COOKIE_IMPORT_FAILURE_REASONS.NoCookiesFound:
          default:
            analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
            toast.error(t("messages.importCookiesEmpty"))
            break
        }
      }
    } catch (error) {
      if (generation !== importGeneration.current) {
        analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      logger.warn("Failed to import cookies", { error, url: url.trim() })
      toast.error(
        t("messages.importCookiesFailed", { error: getErrorMessage(error) }),
      )
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: {
          failure: buildActionFailureDiagnostics({ error }),
        },
      })
    } finally {
      if (generation === importGeneration.current) setIsImportingCookies(false)
    }
  }

  const recoverManually = async () => {
    if (
      activeRecovery.current ||
      isImportingCookies ||
      !validationTarget ||
      !validationTarget.site_type ||
      !supportsAccountCookieRecovery(
        { ...validationTarget, authType },
        validationTarget.login?.methodId,
      ) ||
      !isAccountLoginConfigured(
        validationTarget.login,
        getAccountLoginMethods(validationTarget),
      )
    )
      return
    const generation = ++recoveryGeneration.current
    const requestId = safeRandomUUID("account-cookie-recovery")
    activeRecovery.current = requestId
    setIsRecoveringCookies(true)
    try {
      const source = getCurrentTempWindowRequestSource()
      const response = await sendRuntimeMessage<AccountCookieRecoveryResult>(
        {
          action: RuntimeActionIds.AccountDialogRecoverCookieSession,
          account: { ...validationTarget, authType, site_url: url },
          requestId,
          tempWindowRequestSource: source,
          protectionBypassExecution: createUserCommandProtectionBypassExecution(
            PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
            source,
          ),
        },
        { maxAttempts: 1 },
      )
      if (generation !== recoveryGeneration.current) return
      activeRecovery.current = null
      if (
        response?.status === BROWSER_LOGIN_STATUS.Authenticated &&
        response.identity === String(validationTarget.account_info.id).trim() &&
        response.credential?.cookie.trim()
      ) {
        setVerifiedCookie({
          cookie: response.credential.cookie,
          siteUrl: url,
          siteType: validationTarget.site_type,
          userId: String(validationTarget.account_info.id).trim(),
        })
        applyCookie(response.credential.cookie)
        toast.success(t("cookieValidation.recovered"))
      } else {
        toast.error(
          response?.status === BROWSER_LOGIN_STATUS.IdentityMismatch ||
            (response?.status === BROWSER_LOGIN_STATUS.Authenticated &&
              response.identity !==
                String(validationTarget.account_info.id).trim())
            ? t("cookieValidation.importIdentityMismatch")
            : response && response.status !== BROWSER_LOGIN_STATUS.Authenticated
              ? getAccountCookieRecoveryMessage(response)
              : t("cookieValidation.recoveryFailed"),
        )
      }
    } catch {
      if (generation === recoveryGeneration.current)
        toast.error(t("cookieValidation.recoveryFailed"))
    } finally {
      if (generation === recoveryGeneration.current) {
        activeRecovery.current = null
        setIsRecoveringCookies(false)
      }
    }
  }

  const importAutomatically = async (isCurrent: () => boolean) => {
    const completion = await readCookies({ source: "automatic", isCurrent })
    if (!completion.current) return false
    if (completion.failed) {
      logger.warn("Auto-import cookie failed", {
        error: completion.error,
        url: url.trim(),
      })
      return true
    }
    const response = completion.response
    const header =
      typeof response?.data === "string" ? response.data.trim() : ""
    if (header) {
      applyCookie(header)
      setShowCookiePermissionWarning(false)
    } else if (
      response?.errorCode === COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied
    ) {
      setShowCookiePermissionWarning(true)
      toast.error(t("messages.importCookiesPermissionDenied"))
      logger.info(
        "Cookie auto-import skipped because cookie permissions were denied",
        { url: url.trim() },
      )
    }
    return true
  }
  return {
    state: {
      isImportingCookies,
      verifiedCookie,
      isRecoveringCookies,
      showCookiePermissionWarning,
      cookieAuthPermissionState,
    },
    invalidate,
    reset,
    importManually: handleImportCookieAuthSessionCookie,
    recoverManually,
    importAutomatically,
    requestPermissions: handleRequestCookieAuthPermissions,
  }
}
