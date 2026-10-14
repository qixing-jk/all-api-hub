import {
  AUTO_DETECT_DIAGNOSTIC_EVENTS,
  AUTO_DETECT_SESSION_SOURCES,
  AUTO_DETECT_SOURCE_REASONS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import {
  isUnknownAccountSiteType,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  readAccountBrowserSessionFromTempWindow,
} from "~/services/accountBrowserSession"
import { summarizeApiServiceFetchContext } from "~/services/apiTransport/type"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { createLogger } from "~/utils/core/logger"

import type {
  AutoDetectResult,
  BackgroundAutoDetectRequest,
} from "../autoDetectContracts"
import { getAccountSiteType } from "../detectSiteType"
import { getUserDataViaAPI } from "./apiFallback"
import type { UserDataResult } from "./resultAssembly"
import {
  combineUserDataAndSiteType,
  createAutoDetectContext,
  userDataFromBrowserSession,
  withAutoDetectContext,
} from "./resultAssembly"

const logger = createLogger("AutoDetectService")

/**
 * Fetch user data through background script flow with fallback to API.
 *
 * Sends a runtime request to the background handler, which reads site data from
 * a temporary browser context. If that path fails, this function falls back to
 * an API-based cookie-auth request.
 * @returns User data or null when both methods fail.
 */
async function getUserDataViaBackground({
  url,
  siteType,
  fetchContext,
  protectionBypassExecution,
  diagnostics,
}: BackgroundAutoDetectRequest & {
  siteType: AccountSiteType
}): Promise<UserDataResult | null> {
  const tempWindowRequestSource = getCurrentTempWindowRequestSource()
  let sessionReadFailed = false
  const session = await readAccountBrowserSessionFromTempWindow({
    baseUrl: url,
    siteType,
    fetchContext,
    browserContext: fetchContext,
    protectionBypassExecution,
    diagnostics,
    requestIdPrefix: "auto-detect",
    // Unknown branding must not select an authentication protocol here.
    // Registered adapters own probes for this explicit onboarding read.
    allowSessionProbe: isUnknownAccountSiteType(siteType),
    onError: () => {
      sessionReadFailed = true
    },
  })
  if (session) return userDataFromBrowserSession(session)

  diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SourceFallback, {
    from: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    to: AUTO_DETECT_SESSION_SOURCES.Api,
    reason: sessionReadFailed
      ? AUTO_DETECT_SOURCE_REASONS.Exception
      : AUTO_DETECT_SOURCE_REASONS.NoSessionData,
  })
  logger.info(
    "Background auto-detect returned no user data; using API fallback",
    {
      url,
      siteType,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
    },
  )
  return await getUserDataViaAPI({
    url,
    siteType,
    fetchContext,
    tempWindowRequestSource,
    protectionBypassExecution,
    diagnostics,
  })
}

/**
 * Auto-detect via background flow when runtime/background messaging is available.
 *
 * 1) Read the registered browser session through an authorized temporary context
 * 2) Fall back to the adapter's Cookie bootstrap when no usable session is returned
 */
export async function autoDetectViaBackground(
  request: BackgroundAutoDetectRequest,
): Promise<AutoDetectResult> {
  const {
    url,
    fetchContext,
    protectionBypassExecution,
    diagnostics,
    currentTabMatched,
  } = request
  const options = currentTabMatched ? { currentTabMatched } : {}
  diagnostics?.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.StrategyStarted, {
    strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
    ...options,
  })
  logger.info(
    options.currentTabMatched
      ? "使用带当前标签页上下文的 Background 方式"
      : "使用 Background 方式",
    {
      url,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
    },
  )

  // 检测站点类型，避免在未知站点上下文中使用默认 API
  const siteType = await getAccountSiteType(url, protectionBypassExecution)

  // 通过 Background 获取用户数据
  const userData = await getUserDataViaBackground({ ...request, siteType })

  // 组合用户数据和站点类型（公共逻辑）
  return withAutoDetectContext(
    await combineUserDataAndSiteType(
      userData,
      url,
      protectionBypassExecution,
      diagnostics,
    ),
    createAutoDetectContext({
      strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
      siteType,
      fetchContext,
      ...options,
    }),
  )
}
