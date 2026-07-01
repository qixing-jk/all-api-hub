import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  getOptionalPermissionDescription,
  getOptionalPermissionTitle,
} from "~/services/permissions/permissionDisplay"
import {
  hasPermission,
  onOptionalPermissionsChanged,
  removePermissionDetailed,
  requestPermissionDetailed,
  type ManifestOptionalPermissions,
} from "~/services/permissions/permissionManager"
import {
  getPermissionRemoveOutcome,
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  PRODUCT_ANALYTICS_PERMISSION_OPERATIONS,
  PRODUCT_ANALYTICS_PERMISSION_OUTCOMES,
  trackOptionalPermissionRequestResult,
  trackOptionalPermissionResult,
} from "~/services/productAnalytics/permissions"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"

interface PermissionState {
  statuses: Record<ManifestOptionalPermissions, boolean | null>
  pending: Record<ManifestOptionalPermissions, boolean>
}

interface OptionalPermissionControlsOptions {
  enabled?: boolean
  loggerName: string
  permissionIds: ManifestOptionalPermissions[]
}

const loggerCache = new Map<string, ReturnType<typeof createLogger>>()

/**
 * Reuses one scoped logger per consuming permission surface.
 */
function getLogger(name: string) {
  const existing = loggerCache.get(name)
  if (existing) return existing

  const logger = createLogger(name)
  loggerCache.set(name, logger)
  return logger
}

/**
 * Builds per-permission UI state keyed by optional permission id.
 */
const buildState = <T>(
  permissionIds: ManifestOptionalPermissions[],
  value: T,
) =>
  Object.fromEntries(permissionIds.map((id) => [id, value])) as Record<
    ManifestOptionalPermissions,
    T
  >

/**
 * Manages optional permission status, request, revoke, toast, and analytics UI state.
 */
export function useOptionalPermissionControls({
  enabled = true,
  loggerName,
  permissionIds,
}: OptionalPermissionControlsOptions) {
  const { t } = useTranslation("settings")
  const logger = useMemo(() => getLogger(loggerName), [loggerName])
  const [state, setState] = useState<PermissionState>(() => ({
    statuses: buildState<boolean | null>(permissionIds, null),
    pending: buildState(permissionIds, false),
  }))
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    setState((prev) => ({
      statuses: {
        ...prev.statuses,
        ...buildState<boolean | null>(permissionIds, null),
      },
      pending: {
        ...prev.pending,
        ...buildState(permissionIds, false),
      },
    }))
  }, [permissionIds])

  const loadStatuses = useCallback(async () => {
    if (!enabled || permissionIds.length === 0) return

    setIsRefreshing(true)
    logger.debug("Checking optional permission statuses")
    const results = await Promise.all(
      permissionIds.map(async (id) => ({
        id,
        granted: await hasPermission(id),
      })),
    )
    logger.debug("Optional permission statuses resolved", { results })

    setState((prev) => ({
      ...prev,
      statuses: {
        ...prev.statuses,
        ...results.reduce(
          (acc, curr) => ({
            ...acc,
            [curr.id]: curr.granted,
          }),
          {} as Record<ManifestOptionalPermissions, boolean>,
        ),
      },
    }))
    setIsRefreshing(false)
  }, [enabled, logger, permissionIds])

  useEffect(() => {
    if (!enabled) return

    void loadStatuses()
    const unsubscribe = onOptionalPermissionsChanged(() => {
      void loadStatuses()
    })

    return () => {
      unsubscribe()
    }
  }, [enabled, loadStatuses])

  const handleToggle = useCallback(
    async (id: ManifestOptionalPermissions, shouldEnable: boolean) => {
      setState((prev) => ({
        ...prev,
        pending: {
          ...prev.pending,
          [id]: true,
        },
      }))

      const label = getOptionalPermissionTitle(t, id)
      logger.debug("Permission toggle requested by user", {
        id,
        action: shouldEnable ? "request" : "revoke",
        label,
      })
      let success = false
      const wasGrantedBefore = state.statuses[id] === true

      try {
        if (shouldEnable) {
          const result = await requestPermissionDetailed(id)
          success = result.success
          const wasGrantedAfter = success || wasGrantedBefore
          trackOptionalPermissionRequestResult(id, {
            success,
            failureReason: result.failureReason
              ? result.failureReason
              : undefined,
            wasGrantedBefore,
            wasGrantedAfter,
          })
          logger.debug("Permission request completed", { id, success })
          showResultToast(
            success,
            t("permissions.messages.granted", { name: label }),
            t("permissions.messages.grantFailed", { name: label }),
          )
        } else {
          const result = await removePermissionDetailed(id)
          success = result.success
          const wasGrantedAfter = success ? false : wasGrantedBefore
          trackOptionalPermissionResult(id, {
            operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Remove,
            outcome: result.failureReason
              ? PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError
              : getPermissionRemoveOutcome(success),
            failureReason: result.failureReason
              ? PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException
              : success
                ? undefined
                : PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.RemoveFailed,
            wasGrantedBefore,
            wasGrantedAfter,
          })
          logger.debug("Permission revoke completed", { id, success })
          showResultToast(
            success,
            t("permissions.messages.revoked", { name: label }),
            t("permissions.messages.revokeFailed", { name: label }),
          )
        }

        if (success) {
          setState((prev) => ({
            ...prev,
            statuses: {
              ...prev.statuses,
              [id]: shouldEnable,
            },
          }))
        }
      } catch (error) {
        success = false
        if (shouldEnable) {
          trackOptionalPermissionRequestResult(id, {
            success: false,
            failureReason: error,
            wasGrantedBefore,
            wasGrantedAfter: wasGrantedBefore,
          })
        } else {
          trackOptionalPermissionResult(id, {
            operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Remove,
            outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.ApiError,
            failureReason:
              PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.ApiException,
            wasGrantedBefore,
            wasGrantedAfter: wasGrantedBefore,
          })
        }
        logger.error("Failed to toggle optional permission", { id, error })
        showResultToast(
          false,
          shouldEnable
            ? t("permissions.messages.granted", { name: label })
            : t("permissions.messages.revoked", { name: label }),
          shouldEnable
            ? t("permissions.messages.grantFailed", { name: label })
            : t("permissions.messages.revokeFailed", { name: label }),
        )
      } finally {
        setState((prev) => ({
          ...prev,
          pending: {
            ...prev.pending,
            [id]: false,
          },
        }))
      }
    },
    [logger, state.statuses, t],
  )

  const isLoading = useMemo(
    () => permissionIds.some((id) => state.statuses[id] === null),
    [permissionIds, state.statuses],
  )
  const isAnyPending = useMemo(
    () => permissionIds.some((id) => state.pending[id]),
    [permissionIds, state.pending],
  )

  const permissionItems = useMemo(
    () =>
      permissionIds.map((id) => ({
        id,
        title: getOptionalPermissionTitle(t, id),
        description: getOptionalPermissionDescription(t, id),
        granted: state.statuses[id],
        pending: state.pending[id],
      })),
    [permissionIds, state.pending, state.statuses, t],
  )

  return {
    statuses: state.statuses,
    pending: state.pending,
    isAnyPending,
    isLoading,
    isRefreshing,
    permissionItems,
    handleToggle,
    loadStatuses,
  }
}
