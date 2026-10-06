import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { type DialogMode } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { startAccountDialogAnalyticsAction } from "~/features/AccountManagement/components/AccountDialog/analytics"
import toast from "~/lib/notify"
import {
  ensurePermissionsDetailed,
  hasPermissions,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_IDS,
  OPTIONAL_PERMISSIONS,
  type ManifestOptionalPermissions,
} from "~/services/permissions/permissionManager"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnosticsError"
import { trackOptionalPermissionRequestResult } from "~/services/productAnalytics/permissions"
import { AuthTypeEnum } from "~/types"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

interface CookieAuthPermissionState {
  granted: boolean | null
  pending: boolean
}

const createInitialCookieAuthPermissionState =
  (): CookieAuthPermissionState => ({
    granted: null,
    pending: false,
  })

const getCookieAuthAdvancedPermissions = (): ManifestOptionalPermissions[] => {
  const advancedCandidates: ManifestOptionalPermissions[] = []

  if (
    OPTIONAL_PERMISSIONS.includes(
      OPTIONAL_PERMISSION_IDS.declarativeNetRequestWithHostAccess,
    )
  ) {
    advancedCandidates.push(
      OPTIONAL_PERMISSION_IDS.declarativeNetRequestWithHostAccess,
    )
  }

  if (OPTIONAL_PERMISSIONS.includes(OPTIONAL_PERMISSION_IDS.WebRequest)) {
    advancedCandidates.push(OPTIONAL_PERMISSION_IDS.WebRequest)
  }

  if (
    OPTIONAL_PERMISSIONS.includes(OPTIONAL_PERMISSION_IDS.WebRequestBlocking)
  ) {
    advancedCandidates.push(OPTIONAL_PERMISSION_IDS.WebRequestBlocking)
  }

  return advancedCandidates
}

const getCookieAuthPermissions = (): ManifestOptionalPermissions[] => {
  const permissions: ManifestOptionalPermissions[] = []

  if (OPTIONAL_PERMISSIONS.includes(OPTIONAL_PERMISSION_IDS.Cookies)) {
    permissions.push(OPTIONAL_PERMISSION_IDS.Cookies)
  }

  permissions.push(...getCookieAuthAdvancedPermissions())

  return permissions
}

interface CookieImportResponse {
  success?: boolean
  data?: string
  error?: string
  errorCode?: string
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
}: {
  isOpen: boolean
  mode: DialogMode
  accountId?: string
  url: string
  authType: AuthTypeEnum
  getContext: (url: string) => CookieImportContext
  applyCookie: (value: string) => void
}) {
  const { t } = useTranslation("accountDialog")
  const [isImportingCookies, setIsImportingCookies] = useState(false)
  const [showCookiePermissionWarning, setShowCookiePermissionWarning] =
    useState(false)
  const [cookieAuthPermissionState, setCookieAuthPermissionState] = useState(
    createInitialCookieAuthPermissionState,
  )
  const importGeneration = useRef(0)
  const permissionGeneration = useRef(0)
  const permissionReadGeneration = useRef(0)
  const permissionRequestGeneration = useRef(0)
  const invalidate = useCallback(() => {
    importGeneration.current += 1
    permissionGeneration.current += 1
    setIsImportingCookies(false)
    setCookieAuthPermissionState((prev) => ({ ...prev, pending: false }))
  }, [])
  const reset = useCallback(() => {
    invalidate()
    setShowCookiePermissionWarning(false)
  }, [invalidate])
  useLayoutEffect(() => {
    invalidate()
  }, [isOpen, mode, accountId, url, invalidate])
  useLayoutEffect(() => {
    permissionGeneration.current += 1
    setCookieAuthPermissionState((prev) => ({ ...prev, pending: false }))
  }, [isOpen, mode, accountId, authType])
  useEffect(
    () => () => {
      importGeneration.current += 1
      permissionGeneration.current += 1
    },
    [],
  )

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
    try {
      const response = await sendRuntimeMessage<CookieImportResponse>({
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: url.trim(),
        ...getContext(url.trim()),
      })
      return {
        current: current(),
        response,
        failed: false,
        error: undefined as unknown,
      }
    } catch (error) {
      return { current: current(), response: undefined, failed: true, error }
    } finally {
      if (ownsRequest()) setIsImportingCookies(false)
    }
  }

  const refreshCookieAuthPermissionState = useCallback(async () => {
    const scope = permissionGeneration.current
    const read = ++permissionReadGeneration.current
    const current = () =>
      scope === permissionGeneration.current &&
      read === permissionReadGeneration.current
    try {
      const cookieAuthPermissions = getCookieAuthPermissions()
      const granted = await hasPermissions(cookieAuthPermissions)
      if (!current()) return

      setCookieAuthPermissionState((prev) => ({
        ...prev,
        granted,
      }))
    } catch (error) {
      if (!current()) return
      logger.warn("Failed to refresh cookie auth permission state", { error })
      setCookieAuthPermissionState((prev) => ({
        ...prev,
        granted: false,
      }))
    }
  }, [])
  useEffect(() => {
    if (!isOpen || authType !== AuthTypeEnum.Cookie) {
      return
    }

    void refreshCookieAuthPermissionState()
    const unsubscribe = onOptionalPermissionsChanged(() => {
      void refreshCookieAuthPermissionState()
    })

    return () => {
      unsubscribe()
    }
  }, [authType, isOpen, refreshCookieAuthPermissionState])

  const handleRequestCookieAuthPermissions = useCallback(async () => {
    const scope = permissionGeneration.current
    const request = ++permissionRequestGeneration.current
    const current = () =>
      scope === permissionGeneration.current &&
      request === permissionRequestGeneration.current
    const cookieAuthPermissions = getCookieAuthPermissions()

    if (cookieAuthPermissions.length === 0) {
      setCookieAuthPermissionState((prev) => ({
        ...prev,
        granted: true,
      }))
      return
    }

    setCookieAuthPermissionState((prev) => ({ ...prev, pending: true }))

    try {
      const result = await ensurePermissionsDetailed(cookieAuthPermissions)
      const granted = result.success
      for (const permissionResult of result.requestedResults) {
        trackOptionalPermissionRequestResult(permissionResult.id, {
          success: permissionResult.success,
          failureReason: permissionResult.failureReason
            ? permissionResult.failureReason
            : undefined,
          wasGrantedBefore: permissionResult.wasGrantedBefore,
          wasGrantedAfter: permissionResult.wasGrantedAfter,
        })
      }
      if (!current()) return
      await refreshCookieAuthPermissionState()
      if (!current()) return

      if (granted) {
        toast.success(t("messages.cookiePermissionGranted"))
      } else {
        toast.error(t("messages.cookiePermissionGrantFailed"))
      }
    } catch (error) {
      const wasGrantedBefore = cookieAuthPermissionState.granted === true
      for (const permissionId of cookieAuthPermissions) {
        trackOptionalPermissionRequestResult(permissionId, {
          success: false,
          failureReason: error,
          wasGrantedBefore,
          wasGrantedAfter: wasGrantedBefore,
        })
      }
      if (!current()) return
      logger.warn("Failed to request cookie auth permissions", {
        error,
        permissions: cookieAuthPermissions,
      })
      toast.error(t("messages.cookiePermissionGrantFailed"))
    } finally {
      if (current())
        setCookieAuthPermissionState((prev) => ({
          ...prev,
          pending: false,
        }))
    }
  }, [cookieAuthPermissionState.granted, refreshCookieAuthPermissionState, t])

  const handleImportCookieAuthSessionCookie = async () => {
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
      logger.warn("Failed to import cookies", { error, url: url.trim() })
      toast.error(
        t("messages.importCookiesFailed", { error: getErrorMessage(error) }),
      )
      analyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: {
          failure: buildActionFailureDiagnostics({ error }),
        },
      })
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
      showCookiePermissionWarning,
      cookieAuthPermissionState,
    },
    invalidate,
    reset,
    importManually: handleImportCookieAuthSessionCookie,
    importAutomatically,
    requestPermissions: handleRequestCookieAuthPermissions,
  }
}
