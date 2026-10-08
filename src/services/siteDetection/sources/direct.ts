import {
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { type AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { hasCookiesForUrl } from "~/utils/browser/cookieHelper"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import type { AutoDetectResult } from "../autoDetectContracts"
import { getAccountSiteType } from "../detectSiteType"
import { getUserDataViaAPI } from "./apiFallback"
import {
  combineUserDataAndSiteType,
  createAutoDetectContext,
  withAutoDetectContext,
} from "./resultAssembly"

const logger = createLogger("AutoDetectService")

/**
 * Direct auto-detect: use upstream API to fetch user info (cookie-based).
 *
 * Flow:
 * 1) GET /api/user/self to fetch user profile (requires login cookies)
 * 2) Extract userId and user payload
 * 3) Detect site type and return unified result
 */
export async function autoDetectDirect(
  url: string,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<AutoDetectResult> {
  diagnostics?.record("strategy_started", {
    strategy: AUTO_DETECT_STRATEGIES.DirectApi,
  })
  logger.info("使用直接方式", { url })

  try {
    // 检测站点类型，避免在未知站点上下文中使用默认 API
    const siteType = await getAccountSiteType(url, protectionBypassExecution)

    // 直接方式走 Cookie 认证：目标站点没有任何 Cookie 时不存在可复用的会话，
    // 请求必然失败。提前跳过，避免空发一条注定失败的请求（手机上它常是最后的
    // 兜底，不能因为它在桌面端多半失败就直接去掉）。
    if (!(await hasCookiesForUrl(url))) {
      diagnostics?.record("source_skipped", {
        source: AUTO_DETECT_STRATEGIES.DirectApi,
        reason: "cookies_missing",
      })
      logger.info("目标站点无 Cookie，跳过直接方式", { url })
      return withAutoDetectContext(
        {
          success: false,
          error: t("messages:operations.detection.getUserIdFailed"),
        },
        createAutoDetectContext({
          strategy: AUTO_DETECT_STRATEGIES.DirectApi,
          siteType,
        }),
      )
    }

    // 通过 API 获取用户数据
    const userData = await getUserDataViaAPI(
      url,
      siteType,
      undefined,
      undefined,
      protectionBypassExecution,
      diagnostics,
    )

    // 组合用户数据和站点类型（公共逻辑）
    return withAutoDetectContext(
      await combineUserDataAndSiteType(
        userData,
        url,
        protectionBypassExecution,
        diagnostics,
      ),
      createAutoDetectContext({
        strategy: AUTO_DETECT_STRATEGIES.DirectApi,
        siteType,
      }),
    )
  } catch (error) {
    return {
      success: false,
      autoDetectContext: createAutoDetectContext({
        strategy: AUTO_DETECT_STRATEGIES.DirectApi,
      }),
      error: getErrorMessage(error),
      errorCode: AUTO_DETECT_ERROR_CODES.SITE_TYPE_DETECTION_FAILED,
    }
  }
}
