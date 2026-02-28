/**
 * 账号操作服务模块
 */

import { t } from "i18next"
import toast from "react-hot-toast"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TITLE_RULES, SUB2API, UNKNOWN_SITE } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import {
  ensureDefaultApiTokenForAccount,
  generateDefaultTokenRequest,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { accountStorage } from "~/services/accounts/accountStorage"
import { getApiService } from "~/services/apiService"
import { autoDetectSmart } from "~/services/autoDetectService"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/userPreferences"
import {
  ApiToken,
  AuthTypeEnum,
  SiteHealthStatus,
  type CheckInConfig,
  type DisplaySiteData,
  type SiteAccount,
  type Sub2ApiAuthConfig,
} from "~/types"
import type {
  AccountSaveResponse,
  AccountValidationResponse,
} from "~/types/serviceResponse"
import { analyzeAutoDetectError } from "~/utils/autoDetectUtils"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { extractSessionCookieHeader } from "~/utils/cookieString"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

const logger = createLogger("AccountOperations")

/**
 * Parses a manual balance in USD from a string value and converts it to quota
 * units.
 *
 * Returns undefined when the value is empty/undefined, not a finite number, or
 * negative.
 */
export function parseManualQuotaFromUsd(
  value: string | undefined,
): number | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const amount = Number.parseFloat(trimmed)
  if (!Number.isFinite(amount) || amount < 0) return undefined

  return Math.round(amount * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR)
}

/**
 * 智能自动识别账号信息
 * 工作流程：
 * 1. 通过 background script 创建临时窗口访问目标站点
 * 2. 使用 content script 从站点获取用户信息
 * 3. 调用 API 获取访问令牌和账号数据
 * 4. 保存或更新账号信息到本地存储
 * @param url 站点地址（将被自动标准化并请求）
 * @param authType 当前选择的认证方式（Cookie / AccessToken / None）
 */
export async function autoDetectAccount(
  url: string,
  authType: AuthTypeEnum,
): Promise<AccountValidationResponse> {
  if (!url.trim()) {
    return {
      success: false,
      message: t("messages:errors.validation.urlRequired"),
    }
  }

  try {
    try {
      await sendRuntimeMessage({
        action: RuntimeActionIds.CookieInterceptorTrackUrl,
        url: url.trim(),
      })
    } catch (error) {
      logger.warn("Failed to track cookie interceptor url", {
        url: url.trim(),
        error: getErrorMessage(error),
      })
    }

    // 使用智能自动识别服务
    const detectResult = await autoDetectSmart(url.trim())

    if (!detectResult.success || !detectResult.data) {
      const errorMsg =
        detectResult.error || t("messages:operations.detection.failed")
      const detailedError = analyzeAutoDetectError(errorMsg)
      return {
        success: false,
        message: errorMsg,
        detailedError,
      }
    }

    const { userId, siteType, sub2apiAuth } = detectResult.data
    const isSub2Api = siteType === SUB2API
    const effectiveAuthType = isSub2Api ? AuthTypeEnum.AccessToken : authType

    if (!userId) {
      const detailedError = analyzeAutoDetectError(
        t("messages:operations.detection.getUserIdFailed"),
      )
      return {
        success: false,
        message: t("messages:operations.detection.getUserIdFailed"),
        detailedError,
      }
    }

    let tokenPromise: Promise<any>

    // 根据 authType 选择对应的 Promise
    if (isSub2Api) {
      const accessToken =
        typeof detectResult.data.accessToken === "string"
          ? detectResult.data.accessToken.trim()
          : ""
      const detectedUsername =
        typeof detectResult.data.user?.username === "string"
          ? detectResult.data.user.username.trim()
          : ""

      tokenPromise = Promise.resolve({
        username: detectedUsername,
        access_token: accessToken,
      })
    } else if (effectiveAuthType === AuthTypeEnum.Cookie) {
      tokenPromise = getApiService(siteType).fetchUserInfo({
        baseUrl: url,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId,
        },
      })
    } else if (effectiveAuthType === AuthTypeEnum.AccessToken) {
      tokenPromise = getApiService(siteType).getOrCreateAccessToken({
        baseUrl: url,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId,
        },
      })
    } else {
      // none 或其他情况
      tokenPromise = Promise.resolve(null)
    }

    // 并行执行 token 获取和 site 状态获取（降低端到端等待）
    const [tokenInfo, siteStatus, checkSupport, siteName] = await Promise.all([
      tokenPromise,
      getApiService(siteType).fetchSiteStatus({
        baseUrl: url,
        auth: {
          authType: effectiveAuthType || AuthTypeEnum.None,
        },
      }),
      getApiService(siteType).fetchSupportCheckIn({
        baseUrl: url,
        auth: {
          authType: AuthTypeEnum.None,
        },
      }),
      getSiteName(url),
    ])

    const { username: detectedUsername, access_token } = tokenInfo

    // 验证获取到的用户信息是否完整
    if (
      // Sub2API 默认可能返回空 username（""），此时不应阻止账号识别；但 AccessToken 仍然必须存在
      (!isSub2Api && !detectedUsername) ||
      (effectiveAuthType === AuthTypeEnum.AccessToken && !access_token)
    ) {
      const detailedError = analyzeAutoDetectError(
        t("messages:operations.detection.getInfoFailed"),
      )
      return {
        success: false,
        message: t("messages:operations.detection.getInfoFailed"),
        detailedError,
      }
    }

    // 获取默认充值比例
    const defaultExchangeRate =
      getApiService(siteType).extractDefaultExchangeRate(siteStatus) ??
      UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

    return {
      success: true,
      message: t("accountDialog:messages.autoDetectSuccess"),
      data: {
        username: detectedUsername,
        siteName: siteName,
        accessToken: access_token,
        userId: userId.toString(),
        exchangeRate: defaultExchangeRate,
        checkIn: {
          enableDetection: isSub2Api ? false : checkSupport ?? false,
          autoCheckInEnabled: isSub2Api ? false : true,
          siteStatus: {
            isCheckedInToday: false,
          },
          customCheckIn: {
            url: "",
            redeemUrl: "",
            openRedeemWithCheckIn: true,
            isCheckedInToday: false,
          },
        },
        siteType: siteType,
        ...(isSub2Api && sub2apiAuth ? { sub2apiAuth } : {}),
      },
    }
  } catch (error) {
    logger.error(t("messages:autodetect.failed"), error)
    const detailedError = analyzeAutoDetectError(error)
    const errorMessage = getErrorMessage(error)
    return {
      success: false,
      message: t("accountDialog:messages.autoDetectFailed", {
        error: errorMessage,
      }),
      detailedError,
    }
  }
}

/**
 * 校验账号必填字段是否合法（主要用于表单提交前的快速判断）。
 * @param params 账号核心字段集合
 * @param params.siteName 站点名称
 * @param params.username 用户名
 * @param params.userId 用户 ID
 * @param params.siteType 站点类型（用于特殊站点校验差异）
 * @param params.authType 认证类型
 * @param params.accessToken 访问令牌
 * @param params.cookieAuthSessionCookie Cookie 认证所需的会话 Cookie（Header 值）
 * @param params.exchangeRate 汇率配置
 * @returns 是否满足最基本的账号信息要求
 */
export function isValidAccount({
  siteName,
  username,
  userId,
  siteType,
  authType,
  accessToken,
  cookieAuthSessionCookie,
  exchangeRate,
}: {
  siteName: string
  username: string
  userId: string
  siteType?: string
  authType: AuthTypeEnum
  accessToken: string
  cookieAuthSessionCookie?: string
  exchangeRate: string
}) {
  return (
    !!siteName.trim() &&
    // Sub2API 默认可能返回空 username（""），允许保存账号信息
    (siteType === SUB2API || !!username.trim()) &&
    !!userId.trim() &&
    isValidExchangeRate(exchangeRate) &&
    (authType !== AuthTypeEnum.AccessToken || !!accessToken.trim()) &&
    (authType !== AuthTypeEnum.Cookie || !!cookieAuthSessionCookie?.trim())
  )
}

type TagIdsInput = string[] | undefined

/**
 * Normalizes a tag id list originating from UI widgets into a de-duped string
 * array, trimming whitespace and discarding empty values.
 * @param tagIds - Optional tag id list from UI.
 * @returns A de-duped array of sanitized tag ids or [] when empty.
 */
function normalizeTagIdsInput(tagIds: TagIdsInput): string[] {
  if (!tagIds || tagIds.length === 0) {
    return []
  }

  return Array.from(
    new Set(
      tagIds
        .map((id) => (typeof id === "string" ? id.trim() : String(id ?? "")))
        .filter((id) => id.length > 0),
    ),
  )
}

/**
 *
 */
function normalizeSub2ApiAuthInput(
  siteType: string,
  sub2apiAuth: Sub2ApiAuthConfig | undefined,
): Sub2ApiAuthConfig | undefined {
  if (siteType !== SUB2API) return undefined

  const refreshToken =
    typeof sub2apiAuth?.refreshToken === "string"
      ? sub2apiAuth.refreshToken.trim()
      : ""
  if (!refreshToken) return undefined

  const tokenExpiresAtRaw = sub2apiAuth?.tokenExpiresAt
  const tokenExpiresAt =
    typeof tokenExpiresAtRaw === "number" &&
    Number.isFinite(tokenExpiresAtRaw) &&
    tokenExpiresAtRaw > 0
      ? tokenExpiresAtRaw
      : undefined

  return tokenExpiresAt ? { refreshToken, tokenExpiresAt } : { refreshToken }
}

/**
 * 验证并保存账号信息（用于新增）
 *
 * Validates user-supplied account form data, fetches the freshest remote
 * account metrics, and persists the resulting record via accountStorage.
 * @param url - Target site URL entered by the user.
 * @param siteName - Display name for the account.
 * @param username - Username retrieved from the remote site.
 * @param accessToken - Auth token required for API calls.
 * @param userId - Numeric user id in string form.
 * @param exchangeRate - Recharge exchange rate configured in UI.
 * @param notes - Free-form notes provided by user.
 * @param tagIds - Optional tag ids originating from the tag picker.
 * @param checkInConfig - Check-in configuration captured from UI.
 * @param siteType - Classifier describing the site (OneAPI, etc.).
 * @param authType - Authentication strategy (cookie/token/none).
 * @param cookieAuthSessionCookie - Session cookie for cookie auth.
 * @returns Success payload with new account id or a failure descriptor.
 */
export async function validateAndSaveAccount(
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  notes: string,
  tagIds: TagIdsInput,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum,
  cookieAuthSessionCookie: string,
  manualBalanceUsd?: string,
  excludeFromTotalBalance = false,
  sub2apiAuth?: Sub2ApiAuthConfig,
): Promise<AccountSaveResponse> {
  const sessionCookieHeader =
    authType === AuthTypeEnum.Cookie
      ? extractSessionCookieHeader(cookieAuthSessionCookie)
      : ""

  // 表单验证
  if (
    !isValidAccount({
      siteName,
      username,
      userId,
      siteType,
      authType,
      accessToken,
      cookieAuthSessionCookie: sessionCookieHeader,
      exchangeRate,
    })
  ) {
    return {
      success: false,
      message: t("messages:errors.validation.incompleteAccountInfo"),
    }
  }

  const parsedUserId = parseInt(userId.trim())
  if (isNaN(parsedUserId)) {
    return {
      success: false,
      message: t("messages:errors.validation.userIdNumeric"),
    }
  }

  let shouldAutoProvisionKeyOnAccountAdd =
    DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd ?? false
  let includeTodayCashflow = DEFAULT_PREFERENCES.showTodayCashflow ?? true
  try {
    const prefs = await userPreferences.getPreferences()
    shouldAutoProvisionKeyOnAccountAdd =
      prefs.autoProvisionKeyOnAccountAdd ?? shouldAutoProvisionKeyOnAccountAdd
    includeTodayCashflow = prefs.showTodayCashflow ?? includeTodayCashflow
  } catch (error) {
    logger.warn(
      "Failed to read user preferences; falling back to defaults",
      error,
    )
  }

  const manualQuota = parseManualQuotaFromUsd(manualBalanceUsd)
  const normalizedManualBalanceUsd =
    manualQuota === undefined ? "" : manualBalanceUsd!.trim()
  const normalizedSub2ApiAuth = normalizeSub2ApiAuthInput(siteType, sub2apiAuth)

  try {
    // 获取账号余额和今日使用情况
    logger.debug("Fetching account data for new account", {
      baseUrl: url.trim(),
      siteType,
      authType,
      userId: parsedUserId,
    })
    const freshAccountData = await getApiService(siteType).fetchAccountData({
      baseUrl: url.trim(),
      checkIn: checkInConfig,
      accountId: undefined, // New account, no ID yet
      includeTodayCashflow,
      auth: {
        authType,
        userId: parsedUserId,
        accessToken: accessToken.trim(),
        cookie:
          authType === AuthTypeEnum.Cookie
            ? sessionCookieHeader.trim()
            : undefined,
      },
    })

    const normalizedTagIds = normalizeTagIdsInput(tagIds)

    const accountData: Omit<SiteAccount, "id" | "created_at" | "updated_at"> = {
      site_name: siteName.trim(),
      site_url: url.trim(),
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: siteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT, // 使用用户输入的汇率
      notes: notes || "",
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: freshAccountData.checkIn,
      account_info: {
        id: parsedUserId,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: manualQuota ?? freshAccountData.quota,
        today_prompt_tokens: freshAccountData.today_prompt_tokens,
        today_completion_tokens: freshAccountData.today_completion_tokens,
        today_quota_consumption: freshAccountData.today_quota_consumption,
        today_requests_count: freshAccountData.today_requests_count,
        today_income: freshAccountData.today_income,
      },
      last_sync_time: Date.now(),
    }

    const accountId = await accountStorage.addAccount(accountData)
    logger.info("Account saved with data refresh", {
      accountId,
      siteName: siteName.trim(),
      siteType,
    })

    void autoProvisionKeyOnAccountAdd(
      accountId,
      shouldAutoProvisionKeyOnAccountAdd,
    )

    return {
      success: true,
      message: t("messages:toast.success.accountSaveSuccess"),
      accountId,
    }
  } catch (error) {
    // FALLBACK: 即使获取数据失败也要保存配置
    logger.warn("Data fetch failed; saving configuration only", error)

    // Build partial account data without quota/usage data
    const normalizedTagIds = normalizeTagIdsInput(tagIds)

    const partialAccountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at"
    > = {
      site_name: siteName.trim(),
      site_url: url.trim(),
      site_type: siteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      notes: notes || "",
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: checkInConfig,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getErrorMessage(error),
      },
      account_info: {
        id: parsedUserId,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: manualQuota ?? 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      last_sync_time: Date.now(),
    }

    // Try to save partial account data
    try {
      const accountId = await accountStorage.addAccount(partialAccountData)
      logger.warn("Account saved without data refresh", {
        accountId,
        siteName: siteName.trim(),
        siteType,
      })

      void autoProvisionKeyOnAccountAdd(
        accountId,
        shouldAutoProvisionKeyOnAccountAdd,
      )

      return {
        success: true,
        message: t("messages:warnings.accountSavedWithoutDataRefresh"),
        accountId,
      }
    } catch (saveError) {
      logger.error("Failed to save account", saveError)
      const errorMessage = getErrorMessage(saveError)
      return {
        success: false,
        message: t("messages:errors.operation.saveFailed", {
          error: errorMessage,
        }),
      }
    }
  }
}

/**
 * 验证并更新账号信息（用于编辑）
 *
 * Re-validates edited account data, refreshes remote metrics, and applies a
 * partial update to the existing account record. Falls back to a config-only
 * update when live data fetching fails.
 * @param accountId - Identifier of the stored account to update.
 * @param url - Updated site URL.
 * @param siteName - Updated display name.
 * @param username - Updated username.
 * @param accessToken - Updated auth token.
 * @param userId - Updated user id string.
 * @param exchangeRate - Updated recharge rate string.
 * @param notes - Updated notes.
 * @param tagIds - Updated tag id collection.
 * @param checkInConfig - Updated check-in configuration.
 * @param siteType - Updated site type classification.
 * @param authType - Authentication mode in use.
 * @param cookieAuthSessionCookie - Session cookie for cookie auth.
 * @returns Response describing success/failure and account id.
 */
export async function validateAndUpdateAccount(
  accountId: string,
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  notes: string,
  tagIds: TagIdsInput,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum,
  cookieAuthSessionCookie: string,
  manualBalanceUsd?: string,
  excludeFromTotalBalance = false,
  sub2apiAuth?: Sub2ApiAuthConfig,
): Promise<AccountSaveResponse> {
  const sessionCookieHeader =
    authType === AuthTypeEnum.Cookie
      ? extractSessionCookieHeader(cookieAuthSessionCookie)
      : ""

  // 表单验证
  if (
    !isValidAccount({
      siteName,
      username,
      userId,
      siteType,
      authType,
      accessToken,
      cookieAuthSessionCookie: sessionCookieHeader,
      exchangeRate,
    })
  ) {
    return {
      success: false,
      message: t("messages:errors.validation.incompleteAccountInfo"),
    }
  }

  const parsedUserId = parseInt(userId.trim())
  if (isNaN(parsedUserId)) {
    return {
      success: false,
      message: t("messages:errors.validation.userIdNumeric"),
    }
  }

  const manualQuota = parseManualQuotaFromUsd(manualBalanceUsd)
  const normalizedManualBalanceUsd =
    manualQuota === undefined ? "" : manualBalanceUsd!.trim()
  const normalizedSub2ApiAuth = normalizeSub2ApiAuthInput(siteType, sub2apiAuth)

  try {
    // 获取账号余额和今日使用情况
    logger.debug("Fetching account data for update", {
      accountId,
      baseUrl: url.trim(),
      siteType,
      authType,
      userId: parsedUserId,
    })
    const includeTodayCashflow =
      (await userPreferences.getPreferences()).showTodayCashflow ?? true
    const freshAccountData = await getApiService(siteType).fetchAccountData({
      baseUrl: url.trim(),
      checkIn: checkInConfig,
      accountId,
      includeTodayCashflow,
      auth: {
        authType,
        userId: parsedUserId,
        accessToken: accessToken.trim(),
        cookie:
          authType === AuthTypeEnum.Cookie
            ? sessionCookieHeader.trim()
            : undefined,
      },
    })

    const normalizedTagIds = normalizeTagIdsInput(tagIds)

    const updateData: Partial<Omit<SiteAccount, "id" | "created_at">> = {
      site_name: siteName.trim(),
      site_url: url.trim(),
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: siteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT, // 使用用户输入的汇率
      notes: notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: freshAccountData.checkIn,
      account_info: {
        id: parsedUserId,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: manualQuota ?? freshAccountData.quota,
        today_prompt_tokens: freshAccountData.today_prompt_tokens,
        today_completion_tokens: freshAccountData.today_completion_tokens,
        today_quota_consumption: freshAccountData.today_quota_consumption,
        today_requests_count: freshAccountData.today_requests_count,
        today_income: freshAccountData.today_income,
      },
      last_sync_time: Date.now(),
    }

    const success = await accountStorage.updateAccount(accountId, updateData)
    if (!success) {
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }

    logger.info("Account updated with data refresh", {
      accountId,
      siteName: siteName.trim(),
      siteType,
    })

    return {
      success: true,
      message: t("messages:toast.success.accountUpdateSuccess"),
      accountId,
    }
  } catch (error) {
    // FALLBACK: 即使获取数据失败也要保存配置
    logger.warn("Data fetch failed; saving configuration only", error)

    // Build partial update preserving quota/usage data
    const normalizedTagIds = normalizeTagIdsInput(tagIds)

    const partialUpdateData = {
      site_name: siteName.trim(),
      site_url: url.trim(),
      site_type: siteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      notes: notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: checkInConfig,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getErrorMessage(error),
      },
      account_info: {
        id: parsedUserId,
        access_token: accessToken.trim(),
        username: username.trim(),
        ...(manualQuota === undefined ? {} : { quota: manualQuota }),
      },
      last_sync_time: Date.now(),
    }

    // Try to save partial update
    const success = await accountStorage.updateAccount(
      accountId,
      partialUpdateData,
    )

    if (!success) {
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }

    return {
      success: true,
      message: t("messages:warnings.accountUpdatedWithoutDataRefresh"),
      accountId,
    }
  }
}

// 提取域名的主要部分（一级域名前缀）
/**
 * 提取域名关键部分（排除 www 与常见双后缀）供 UI 显示默认站点名使用。
 * @param hostname 待分析的主机名
 * @returns 规范化后的前缀并首字母大写
 */
export function extractDomainPrefix(hostname: string): string {
  if (!hostname) return ""

  // 移除 www. 前缀
  const withoutWww = hostname.replace(/^www\./, "")

  // 处理子域名情况，例如：xxx.xx.google.com -> google
  const parts = withoutWww.split(".")
  if (parts.length >= 2) {
    // 如果是常见的二级域名（如 .com.cn, .co.uk 等），取倒数第三个部分
    const lastPart = parts[parts.length - 1]
    const secondLastPart = parts[parts.length - 2]

    // 检查是否为双重后缀
    const doubleSuffixes = ["com", "net", "org", "gov", "edu", "co"]
    if (
      parts.length >= 3 &&
      doubleSuffixes.includes(secondLastPart) &&
      lastPart.length === 2
    ) {
      // 首字母大写
      return (
        parts[parts.length - 3].charAt(0).toUpperCase() +
        parts[parts.length - 3].slice(1)
      )
    }

    // 否则返回倒数第二个部分
    return secondLastPart.charAt(0).toUpperCase() + secondLastPart.slice(1)
  }

  return withoutWww.charAt(0).toUpperCase() + withoutWww.slice(1)
}

/**
 * 判断站点名称是否仍是默认标题（如“未知站点”），用于决定是否替换。
 * @param siteName 待检测的站点名称
 * @returns true 表示不是默认名称
 */
function IsNotDefaultSiteName(siteName: string): boolean {
  return !SITE_TITLE_RULES.some(
    (rule) => rule.name !== UNKNOWN_SITE && rule.regex.test(siteName),
  )
}
/**
 * 根据 Tab、URL 或站点状态信息推断最终展示的站点名称。
 * @param input 可能为浏览器 Tab 对象或字符串 URL
 * @returns 计算后的站点名称
 */
export async function getSiteName(
  input: browser.tabs.Tab | string,
): Promise<string> {
  // 1. 统一提取信息
  const urlString = typeof input === "string" ? input : input.url ?? ""
  const tabTitle = typeof input === "string" ? null : input.title

  // 2. 优先从 Tab 标题获取
  if (tabTitle && IsNotDefaultSiteName(tabTitle)) {
    return tabTitle
  }

  // 3. 解析 URL
  const urlObj = new URL(urlString)
  const hostWithProtocol = `${urlObj.protocol}//${urlObj.host}`

  // 4. 从站点状态获取
  const siteStatusInfo = await getApiService(undefined).fetchSiteStatus({
    baseUrl: hostWithProtocol,
    auth: {
      authType: AuthTypeEnum.None,
    },
  })
  if (
    siteStatusInfo?.system_name &&
    IsNotDefaultSiteName(siteStatusInfo.system_name)
  ) {
    return siteStatusInfo.system_name
  }

  // 5. 最后从域名获取
  return extractDomainPrefix(urlObj.hostname)
}

/**
 * Checks if a given exchange rate is valid.
 * @param rate - The exchange rate to check.
 * @returns True if the exchange rate is valid, false otherwise.
 * A valid exchange rate is a number greater than 0.
 */
export function isValidExchangeRate(rate: string): boolean {
  const num = parseFloat(rate)
  return !isNaN(num) && num > 0
}

/**
 * Ensures that an API token exists for the supplied account by checking the
 * remote token inventory and lazily issuing a default token when none exist.
 * Provides toast updates for the long-running request to improve UX feedback.
 * @param account - The underlying account record (includes credentials).
 * @param displaySiteData - Derived display data used by token APIs.
 * @param toastId - Optional toast identifier to reuse existing notifications.
 * @returns The ensured ApiToken ready for downstream use.
 * @throws {Error} 当密钥获取或生成都失败时抛出异常
 */
export async function ensureAccountApiToken(
  account: SiteAccount,
  displaySiteData: DisplaySiteData,
  toastId?: string,
): Promise<ApiToken> {
  toast.loading(t("messages:accountOperations.checkingApiKeys"), {
    id: toastId,
  })

  const tokens = await getApiService(
    displaySiteData.siteType,
  ).fetchAccountTokens({
    baseUrl: displaySiteData.baseUrl,
    accountId: displaySiteData.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  })
  let apiToken: ApiToken | undefined = tokens.at(-1)

  if (!apiToken) {
    const newTokenData = generateDefaultTokenRequest()
    const createApiTokenResult = await getApiService(
      displaySiteData.siteType,
    ).createApiToken(
      {
        baseUrl: account.site_url,
        accountId: account.id,
        auth: {
          authType: account.authType,
          userId: account.account_info.id,
          accessToken: account.account_info.access_token,
          cookie: account.cookieAuth?.sessionCookie,
        },
      },
      newTokenData,
    )

    if (!createApiTokenResult) {
      throw new Error(t("messages:accountOperations.createTokenFailed"))
    }

    const updatedTokens = await getApiService(
      displaySiteData.siteType,
    ).fetchAccountTokens({
      baseUrl: displaySiteData.baseUrl,
      accountId: displaySiteData.id,
      auth: {
        authType: displaySiteData.authType,
        userId: displaySiteData.userId,
        accessToken: displaySiteData.token,
        cookie: displaySiteData.cookieAuthSessionCookie,
      },
    })
    apiToken = updatedTokens.at(-1)
  }

  if (!apiToken) {
    throw new Error(t("messages:accountOperations.tokenNotFound"))
  }

  return apiToken
}

/**
 * Best-effort default API key auto-provisioning after account add.
 *
 * This is intentionally non-blocking for the save flow, but should provide
 * explicit UX feedback so users can confirm whether a key was created or the
 * account already had keys.
 */
async function autoProvisionKeyOnAccountAdd(
  accountId: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return

  try {
    const account = await accountStorage.getAccountById(accountId)
    if (!account) {
      logger.warn("Auto-provision skipped: account not found", { accountId })
      return
    }

    if (account.disabled === true) {
      return
    }

    if (account.site_type === SUB2API) {
      return
    }

    if (account.authType === AuthTypeEnum.None) {
      return
    }

    const displaySiteData = accountStorage.convertToDisplayData(account)
    const hasToken =
      typeof displaySiteData?.token === "string" &&
      displaySiteData.token.trim().length > 0
    const hasCookie =
      typeof displaySiteData?.cookieAuthSessionCookie === "string" &&
      displaySiteData.cookieAuthSessionCookie.trim().length > 0

    if (
      typeof displaySiteData?.id !== "string" ||
      displaySiteData.id.trim().length === 0 ||
      typeof displaySiteData?.baseUrl !== "string" ||
      displaySiteData.baseUrl.trim().length === 0 ||
      typeof displaySiteData?.siteType !== "string" ||
      displaySiteData.siteType.trim().length === 0 ||
      displaySiteData.authType === AuthTypeEnum.None ||
      !Number.isFinite(displaySiteData.userId) ||
      (displaySiteData.authType === AuthTypeEnum.AccessToken && !hasToken) ||
      (displaySiteData.authType === AuthTypeEnum.Cookie &&
        !hasToken &&
        !hasCookie)
    ) {
      throw new Error("invalid_display_site_data")
    }

    const { created } = await ensureDefaultApiTokenForAccount({
      account,
      displaySiteData,
    })

    toast.success(
      t(
        created
          ? "messages:accountOperations.autoProvisionCreated"
          : "messages:accountOperations.autoProvisionAlreadyHad",
        { accountName: displaySiteData.name || account.site_name },
      ),
    )
  } catch (error) {
    toast.error(
      t("messages:accountOperations.autoProvisionFailed", {
        actionLabel: t("keyManagement:repairMissingKeys.action"),
      }),
    )
    logger.warn("Auto-provision key after account add failed", {
      accountId,
      error: getErrorMessage(error),
    })
  }
}
