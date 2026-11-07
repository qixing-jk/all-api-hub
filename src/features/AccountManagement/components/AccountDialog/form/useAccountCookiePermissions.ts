import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import {
  ensurePermissionsDetailed,
  hasPermissions,
  onOptionalPermissionsChanged,
  OPTIONAL_PERMISSION_IDS,
  OPTIONAL_PERMISSIONS,
  type ManifestOptionalPermissions,
} from "~/services/permissions/permissionManager"
import { trackOptionalPermissionRequestResult } from "~/services/productAnalytics/facts/permissions"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AccountDialogHook")

interface CookieAuthPermissionState {
  granted: boolean | null
  pending: boolean
}

const createInitialCookieAuthPermissionState =
  (): CookieAuthPermissionState => ({
    granted: null,
    pending: false,
  })

const getCookieAuthPermissions = (): ManifestOptionalPermissions[] =>
  [
    OPTIONAL_PERMISSION_IDS.Cookies,
    OPTIONAL_PERMISSION_IDS.declarativeNetRequestWithHostAccess,
    OPTIONAL_PERMISSION_IDS.WebRequest,
    OPTIONAL_PERMISSION_IDS.WebRequestBlocking,
  ].filter((permission) => OPTIONAL_PERMISSIONS.includes(permission))

/** Owns permission reads, requests and their feedback within the editor lifetime. */
export function useAccountCookiePermissions({
  isOpen,
  authType,
}: {
  isOpen: boolean
  authType: AuthTypeEnum
}) {
  const { t } = useTranslation("accountDialog")
  const [cookieAuthPermissionState, setCookieAuthPermissionState] = useState(
    createInitialCookieAuthPermissionState,
  )
  const permissionGeneration = useRef(0)
  const permissionReadGeneration = useRef(0)
  const permissionRequestGeneration = useRef(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const invalidate = useCallback(() => {
    permissionGeneration.current += 1
    setCookieAuthPermissionState((prev) => ({ ...prev, pending: false }))
    setRefreshVersion((value) => value + 1)
  }, [])
  useEffect(
    () => () => {
      permissionGeneration.current += 1
    },
    [],
  )

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
  }, [authType, isOpen, refreshCookieAuthPermissionState, refreshVersion])

  useEffect(() => {
    if (!isOpen || authType !== AuthTypeEnum.Cookie) return
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

  return {
    state: cookieAuthPermissionState,
    invalidate,
    requestPermissions: handleRequestCookieAuthPermissions,
  }
}
