import {
  AUTO_DETECT_DIAGNOSTIC_EVENTS,
  AUTO_DETECT_ERROR_CODES,
  AUTO_DETECT_SOURCE_REASONS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { hasCookiesForUrl } from "~/utils/browser/cookieHelper"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import type {
  AutoDetectRequest,
  AutoDetectResult,
} from "../autoDetectContracts"
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
 * 1) Classify the site and require a reusable Cookie session
 * 2) Read user identity through the registered account-bootstrap capability
 * 3) Assemble the unified detection result
 */
export async function autoDetectDirect({
  url,
  protectionBypassExecution,
  diagnostics,
}: AutoDetectRequest): Promise<AutoDetectResult> {
  diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.StrategyStarted, {
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
      diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceSkipped, {
        source: AUTO_DETECT_STRATEGIES.DirectApi,
        reason: AUTO_DETECT_SOURCE_REASONS.CookiesMissing,
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
    const userData = await getUserDataViaAPI({
      url,
      siteType,
      protectionBypassExecution,
      diagnostics,
    })

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
