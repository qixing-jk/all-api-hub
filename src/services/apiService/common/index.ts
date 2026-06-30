import type { HealthCheckResult } from "~/services/accounts/accountDataModel"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { SiteHealthStatus, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import { t } from "~/utils/i18n/core"

// ============= 健康状态判断 =============

/**
 * Map runtime errors to the user-facing health status shown in the dashboard.
 *
 * - API errors with HTTP response codes become `Warning` with rich messaging.
 * - API errors without HTTP codes (schema issues, etc.) render as `Unknown`.
 * - Network-level `TypeError`s become `Error` to highlight connectivity issues.
 * - Any other error falls back to `Unknown` to avoid misleading the user.
 * @param error Arbitrary runtime error thrown during refresh.
 * @returns Health status object suitable for persistence + UI display.
 */
export const determineHealthStatus = (error: any): HealthCheckResult => {
  if (error instanceof ApiError) {
    // Temp-window fallback was eligible, but blocked by user config or permissions.
    // Surface a direct reminder so the health tooltip can guide the user.
    if (error.code === API_ERROR_CODES.TEMP_WINDOW_DISABLED) {
      return {
        status: SiteHealthStatus.Warning,
        message: t("account:healthStatus.tempWindowDisabled"),
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      }
    }
    if (error.code === API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED) {
      return {
        status: SiteHealthStatus.Warning,
        message: t("account:healthStatus.tempWindowPermissionRequired"),
        code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
      }
    }

    // HTTP响应码不为200的情况
    if (error.statusCode) {
      return {
        status: SiteHealthStatus.Warning,
        message: t("account:healthStatus.httpError", {
          statusCode: error.statusCode,
          message: error.message,
        }),
      }
    }
    // 其他API错误（数据格式错误等）
    return {
      status: SiteHealthStatus.Unknown,
      message: error.message || t("account:healthStatus.apiError"),
    }
  }

  // 网络连接失败、超时等HTTP请求失败的情况
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return {
      status: SiteHealthStatus.Error,
      message: t("account:healthStatus.networkFailed"),
    }
  }

  // 其他未知错误
  return {
    status: SiteHealthStatus.Unknown,
    message: error.message || t("account:healthStatus.unknownError"),
  }
}
