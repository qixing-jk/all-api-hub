/**
 * 账号操作服务模块
 */

import { t } from "i18next"
import toast from "react-hot-toast"

import { SITE_TITLE_RULES, UNKNOWN_SITE } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { accountStorage } from "~/services/accountStorage"
import { getApiService } from "~/services/apiService"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import {
  ApiToken,
  AuthTypeEnum,
  SiteHealthStatus,
  type CheckInConfig,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import type {
  AccountSaveResponse,
  AccountValidationResponse,
} from "~/types/serviceResponse"
import { analyzeAutoDetectError } from "~/utils/autoDetectUtils"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"

import { autoDetectSmart } from "./autoDetectService"

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
        action: "cookieInterceptor:trackUrl",
        url: url.trim(),
      })
    } catch (error) {
      console.log(
        "[AutoDetect] Failed to track cookie interceptor url:",
        getErrorMessage(error),
      )
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

    const { userId, siteType } = detectResult.data

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
    if (authType === AuthTypeEnum.Cookie) {
      tokenPromise = getApiService(siteType).fetchUserInfo({
        baseUrl: url,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId,
        },
      })
    } else if (authType === AuthTypeEnum.AccessToken) {
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
          authType: authType || AuthTypeEnum.None,
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

    if (!detectedUsername || !access_token) {
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
      getApiService(undefined).extractDefaultExchangeRate(siteStatus)

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
          enableDetection: checkSupport ?? false,
          isCheckedInToday: false,
          customCheckInUrl: "",
          customRedeemUrl: "",
          openRedeemWithCheckIn: true,
        },
        siteType: siteType,
      },
    }
  } catch (error) {
    console.error(t("messages:autodetect.failed"), error)
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
 * @param params.authType 认证类型
 * @param params.accessToken 访问令牌
 * @param params.exchangeRate 汇率配置
 * @returns 是否满足最基本的账号信息要求
 */
export function isValidAccount({
  siteName,
  username,
  userId,
  authType,
  accessToken,
  exchangeRate,
}: {
  siteName: string
  username: string
  userId: string
  authType: AuthTypeEnum
  accessToken: string
  exchangeRate: string
}) {
  return (
    !!siteName.trim() &&
    !!username.trim() &&
    !!userId.trim() &&
    isValidExchangeRate(exchangeRate) &&
    (authType !== AuthTypeEnum.AccessToken || !!accessToken.trim())
  )
}

type TagsInput = string[] | string | undefined

/**
 * Normalizes a tags input originating from various form widgets into a clean
 * string array, trimming whitespace and discarding empty values.
 * @param tags - Array, single string, or undefined tags payload from UI.
 * @returns An array of sanitized tag strings or undefined when no tags remain.
 */
function normalizeTagsInput(tags: TagsInput): string[] | undefined {
  if (!tags) {
    return undefined
  }

  if (Array.isArray(tags)) {
    return tags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter((tag) => tag.length > 0)
  }

  if (typeof tags === "string") {
    const trimmed = tags.trim()
    return trimmed ? [trimmed] : undefined
  }

  return undefined
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
 * @param tags - Optional tags originating from the form field.
 * @param checkInConfig - Check-in configuration captured from UI.
 * @param siteType - Classifier describing the site (OneAPI, etc.).
 * @param authType - Authentication strategy (cookie/token/none).
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
  tags: TagsInput,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum,
): Promise<AccountSaveResponse> {
  // 表单验证
  if (
    !isValidAccount({
      siteName,
      username,
      userId,
      authType,
      accessToken,
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

  try {
    // 获取账号余额和今日使用情况
    console.log(t("messages:toast.loading.fetchingAccountData"))
    const freshAccountData = await getApiService(siteType).fetchAccountData({
      baseUrl: url.trim(),
      checkIn: checkInConfig,
      auth: {
        authType,
        userId: parsedUserId,
        accessToken: accessToken.trim(),
      },
    })

    const normalizedTags = normalizeTagsInput(tags)

    const accountData: Omit<SiteAccount, "id" | "created_at" | "updated_at"> = {
      site_name: siteName.trim(),
      site_url: url.trim(),
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: siteType,
      authType: authType,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT, // 使用用户输入的汇率
      notes: notes || "",
      tags: normalizedTags,
      checkIn: freshAccountData.checkIn,
      account_info: {
        id: parsedUserId,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: freshAccountData.quota,
        today_prompt_tokens: freshAccountData.today_prompt_tokens,
        today_completion_tokens: freshAccountData.today_completion_tokens,
        today_quota_consumption: freshAccountData.today_quota_consumption,
        today_requests_count: freshAccountData.today_requests_count,
        today_income: freshAccountData.today_income,
      },
      last_sync_time: Date.now(),
    }

    const accountId = await accountStorage.addAccount(accountData)
    console.log(t("messages:toast.success.accountSaveSuccess"), {
      id: accountId,
      siteName,
      freshAccountData,
    })

    return {
      success: true,
      message: t("messages:toast.success.accountSaveSuccess"),
      accountId,
    }
  } catch (error) {
    // FALLBACK: 即使获取数据失败也要保存配置
    console.warn("Data fetch failed, saving configuration only:", error)

    // Build partial account data without quota/usage data
    const normalizedTags = normalizeTagsInput(tags)

    const partialAccountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at"
    > = {
      site_name: siteName.trim(),
      site_url: url.trim(),
      site_type: siteType,
      authType: authType,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      notes: notes || "",
      tags: normalizedTags,
      checkIn: checkInConfig,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getErrorMessage(error),
      },
      account_info: {
        id: parsedUserId,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: 0,
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
      console.log("Account saved without data refresh:", {
        id: accountId,
        siteName,
      })

      return {
        success: true,
        message: t("messages:warnings.accountSavedWithoutDataRefresh"),
        accountId,
      }
    } catch (saveError) {
      console.error("Failed to save account:", saveError)
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
 * @param tags - Updated tag collection.
 * @param checkInConfig - Updated check-in configuration.
 * @param siteType - Updated site type classification.
 * @param authType - Authentication mode in use.
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
  tags: TagsInput,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum,
): Promise<AccountSaveResponse> {
  // 表单验证
  if (
    !isValidAccount({
      siteName,
      username,
      userId,
      authType,
      accessToken,
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

  try {
    // 获取账号余额和今日使用情况
    console.log(t("messages:toast.loading.fetchingAccountData"))
    const freshAccountData = await getApiService(siteType).fetchAccountData({
      baseUrl: url.trim(),
      checkIn: checkInConfig,
      auth: {
        authType,
        userId: parsedUserId,
        accessToken: accessToken.trim(),
      },
    })

    const normalizedTags = normalizeTagsInput(tags)

    const updateData: Partial<Omit<SiteAccount, "id" | "created_at">> = {
      site_name: siteName.trim(),
      site_url: url.trim(),
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: siteType,
      authType: authType,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT, // 使用用户输入的汇率
      notes: notes,
      tags: normalizedTags,
      checkIn: freshAccountData.checkIn,
      account_info: {
        id: parsedUserId,
        access_token: accessToken.trim(),
        username: username.trim(),
        quota: freshAccountData.quota,
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

    console.log(t("messages:toast.success.accountUpdateSuccess"), {
      id: accountId,
      siteName,
      freshAccountData,
    })

    return {
      success: true,
      message: t("messages:toast.success.accountUpdateSuccess"),
      accountId,
    }
  } catch (error) {
    // FALLBACK: 即使获取数据失败也要保存配置
    console.warn("Data fetch failed, saving configuration only:", error)

    // Build partial update preserving quota/usage data
    const normalizedTags = normalizeTagsInput(tags)

    const partialUpdateData = {
      site_name: siteName.trim(),
      site_url: url.trim(),
      site_type: siteType,
      authType: authType,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      notes: notes,
      tags: normalizedTags,
      checkIn: checkInConfig,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getErrorMessage(error),
      },
      account_info: {
        id: parsedUserId,
        access_token: accessToken.trim(),
        username: username.trim(),
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
 * 生成默认的令牌信息
 *  该函数会返回一个 CreateTokenRequest 对象，用于生成一个默认的令牌
 *  该令牌的特性是：
 *    - 名称为 "user group (auto)"
 *    - 不限制调用次数
 *    - 永不过期
 *    - 不限制 IP
 *    - 不限制模型
 *    - 不指定分组，为用户分组
 */
function generateDefaultToken(): CreateTokenRequest {
  return {
    name: `user group (auto)`,
    unlimited_quota: true,
    expired_time: -1, // Never expires
    remain_quota: 0,
    allow_ips: "", // No IP restriction
    model_limits_enabled: false,
    model_limits: "", // All models allowed
    // 为空则是跟随用户分组
    group: "",
  }
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
    },
  })
  let apiToken: ApiToken | undefined = tokens.at(-1)

  if (!apiToken) {
    const newTokenData = generateDefaultToken()
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
      },
    })
    apiToken = updatedTokens.at(-1)
  }

  if (!apiToken) {
    throw new Error(t("messages:accountOperations.tokenNotFound"))
  }

  return apiToken
}
