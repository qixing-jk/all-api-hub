import { RuntimeActionIds } from "~/constants/runtimeActions"
import { browserApiLogger as logger } from "~/utils/browser/browserEnvironment"
import { sendRuntimeActionMessage } from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"

/**
 * Check permissions via background script message (for content scripts).
 * @param permissions Permission descriptor to check.
 * @returns Resolves true when the permission is granted, false otherwise.
 */
export async function checkPermissionViaMessage(
  permissions: browser.permissions.Permissions,
): Promise<boolean> {
  try {
    const response = await sendRuntimeActionMessage({
      action: RuntimeActionIds.PermissionsCheck,
      permissions,
    })
    return response?.hasPermission ?? false
  } catch (error) {
    logger.error("checkPermissionViaMessage failed", { permissions, error })
    return false
  }
}

// Permissions helpers
/**
 * Check whether the extension already holds the requested permissions.
 * @param permissions Permission descriptor passed directly to the browser API.
 * @returns Resolves true when the set is already granted, false otherwise.
 */
export async function containsPermissions(
  permissions: browser.permissions.Permissions,
): Promise<boolean> {
  try {
    return await browser.permissions.contains(permissions)
  } catch (error) {
    logger.error("permissions.contains failed", { permissions, error })
    return false
  }
}

export const PERMISSION_OPERATION_FAILURE_REASONS = {
  ApiException: "api_exception",
} as const

export type PermissionOperationFailureReason =
  (typeof PERMISSION_OPERATION_FAILURE_REASONS)[keyof typeof PERMISSION_OPERATION_FAILURE_REASONS]

export interface PermissionOperationResult {
  success: boolean
  failureReason?: PermissionOperationFailureReason
}

/**
 * Request additional permissions and preserve whether failure came from the API itself.
 */
export async function requestPermissionsDetailed(
  permissions: browser.permissions.Permissions,
): Promise<PermissionOperationResult> {
  try {
    return { success: await browser.permissions.request(permissions) }
  } catch (error) {
    logger.error("permissions.request failed", { permissions, error })
    return {
      success: false,
      failureReason: PERMISSION_OPERATION_FAILURE_REASONS.ApiException,
    }
  }
}

/**
 * Remove previously granted permissions and preserve whether failure came from the API itself.
 */
export async function removePermissionsDetailed(
  permissions: browser.permissions.Permissions,
): Promise<PermissionOperationResult> {
  try {
    return { success: await browser.permissions.remove(permissions) }
  } catch (error) {
    logger.error("permissions.remove failed", { permissions, error })
    return {
      success: false,
      failureReason: PERMISSION_OPERATION_FAILURE_REASONS.ApiException,
    }
  }
}

/**
 * Subscribe to permission-added events and return an unsubscribe callback.
 * @param callback Handler receiving the granted permission set.
 */
export function onPermissionsAdded(
  callback: (permissions: browser.permissions.Permissions) => void,
): () => void {
  try {
    browser.permissions.onAdded.addListener(callback)
    return () => browser.permissions.onAdded.removeListener(callback)
  } catch (error) {
    logger.warn("permissions.onAdded listener unavailable", {
      error: getErrorMessage(error),
    })
    return () => {}
  }
}

/**
 * Subscribe to permission-removed events and return an unsubscribe callback.
 * @param callback Handler receiving the revoked permission set.
 */
export function onPermissionsRemoved(
  callback: (permissions: browser.permissions.Permissions) => void,
): () => void {
  try {
    browser.permissions.onRemoved.addListener(callback)
    return () => browser.permissions.onRemoved.removeListener(callback)
  } catch (error) {
    logger.warn("permissions.onRemoved listener unavailable", {
      error: getErrorMessage(error),
    })
    return () => {}
  }
}
