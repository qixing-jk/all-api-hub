import { AUTO_DETECT_STRATEGIES } from "~/constants/autoDetect"
import {
  isUnknownAccountSiteType,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  readAccountBrowserSessionFromTempWindow,
} from "~/services/accountBrowserSession"
import { type AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import { summarizeApiServiceFetchContext } from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { createLogger } from "~/utils/core/logger"

import type {
  AutoDetectFetchContext,
  AutoDetectResult,
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
 * @param url Target site URL.
 * @param siteType Detected site type used to select an API implementation.
 * @returns User data or null when both methods fail.
 */
async function getUserDataViaBackground(
  url: string,
  siteType: AccountSiteType,
  fetchContext?: AutoDetectFetchContext,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<UserDataResult | null> {
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

  diagnostics?.record("source_fallback", {
    from: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    to: "api",
    reason: sessionReadFailed ? "exception" : "no_session_data",
  })
  logger.info(
    "Background auto-detect returned no user data; using API fallback",
    {
      url,
      siteType,
      fetchContext: summarizeApiServiceFetchContext(fetchContext),
    },
  )
  return await getUserDataViaAPI(
    url,
    siteType,
    fetchContext,
    tempWindowRequestSource,
    protectionBypassExecution,
    diagnostics,
  )
}

/**
 * Auto-detect via background flow when runtime/background messaging is available.
 *
 * 1) Background script acquires a temporary browser context to read localStorage
 * 2) Falls back to API-based fetch when storage read fails
 */
export async function autoDetectViaBackground(
  url: string,
  fetchContext?: AutoDetectFetchContext,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
  options: { currentTabMatched?: true } = {},
): Promise<AutoDetectResult> {
  diagnostics?.record("strategy_started", {
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
  const userData = await getUserDataViaBackground(
    url,
    siteType,
    fetchContext,
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
      strategy: AUTO_DETECT_STRATEGIES.BackgroundTempContext,
      siteType,
      fetchContext,
      ...options,
    }),
  )
}
