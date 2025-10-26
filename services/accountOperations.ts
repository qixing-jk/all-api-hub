/**
 * 账号操作服务模块
 */

import { t } from "i18next"
import toast from "react-hot-toast"

import { UI_CONSTANTS } from "~/constants/ui"
import { accountStorage } from "~/services/accountStorage"
import {
  createApiToken,
  extractDefaultExchangeRate,
  fetchAccountTokens
} from "~/services/apiService"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import { importToNewApi } from "~/services/newApiService"
import { userPreferences } from "~/services/userPreferences"
import {
  AccountValidationResponse,
  ApiToken,
  AuthTypeEnum,
  SiteHealthStatus,
  type CheckInConfig,
  type DisplaySiteData,
  type SiteAccount
} from "~/types"
import type {
  AccountSaveResponse,
  NewApiResponse
} from "~/types/serviceResponse"
import { analyzeAutoDetectError } from "~/utils/autoDetectUtils"

import { getErrorMessage } from "../utils/error"
import {
  fetchAccountData,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchUserInfo,
  getOrCreateAccessToken
} from "./apiService"
import { autoDetectSmart } from "./autoDetectService"

/**
 * 智能自动识别账号信息
 * 工作流程：
 * 1. 通过 background script 创建临时窗口访问目标站点
 * 2. 使用 content script 从站点获取用户信息
 * 3. 调用 API 获取访问令牌和账号数据
 * 4. 保存或更新账号信息到本地存储
 * @param url
 * @param authType
 */
export async function autoDetectAccount(
  url: string,
  authType: AuthTypeEnum
): Promise<AccountValidationResponse> {
  if (!url.trim()) {
    return {
      success: false,
      message: t("messages:errors.validation.urlRequired")
    }
  }

  try {
    // 使用智能自动识别服务
    const detectResult = await autoDetectSmart(url.trim())

    if (!detectResult.success || !detectResult.data) {
      const errorMsg =
        detectResult.error || t("messages:operations.detection.failed")
      const detailedError = analyzeAutoDetectError(errorMsg)
      return {
        success: false,
        message: errorMsg,
        detailedError
      }
    }

    const { userId, siteType } = detectResult.data

    if (!userId) {
      const detailedError = analyzeAutoDetectError(
        t("messages:operations.detection.getUserIdFailed")
      )
      return {
        success: false,
        message: t("messages:operations.detection.getUserIdFailed"),
        detailedError
      }
    }

    let tokenPromise: Promise<any>

    // 根据 authType 选择对应的 Promise
    if (authType === AuthTypeEnum.Cookie) {
      tokenPromise = fetchUserInfo(url, userId)
    } else if (authType === AuthTypeEnum.AccessToken) {
      tokenPromise = getOrCreateAccessToken(url, userId)
    } else {
      // none 或其他情况
      tokenPromise = Promise.resolve(null)
    }

    // 并行执行 token 获取和 site 状态获取
    const [tokenInfo, siteStatus, checkSupport, siteName] = await Promise.all([
      tokenPromise,
      fetchSiteStatus(url, authType),
      fetchSupportCheckIn(url),
      getSiteName(url)
    ])

    const { username: detectedUsername, access_token } = tokenInfo

    if (!detectedUsername || !access_token) {
      const detailedError = analyzeAutoDetectError(
        t("messages:operations.detection.getInfoFailed")
      )
      return {
        success: false,
        message: t("messages:operations.detection.getInfoFailed"),
        detailedError
      }
    }

    // 获取默认充值比例
    const defaultExchangeRate = extractDefaultExchangeRate(siteStatus)

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
          customRedeemPath: "",
          openRedeemWithCheckIn: true
        },
        siteType: siteType
      }
    }
  } catch (error) {
    console.error(t("messages:autodetect.failed"), error)
    const detailedError = analyzeAutoDetectError(error)
    const errorMessage = getErrorMessage(error)
    return {
      success: false,
      message: t("accountDialog:messages.autoDetectFailed", {
        error: errorMessage
      }),
      detailedError
    }
  }
}

// 验证并保存账号信息（用于新增）
export async function validateAndSaveAccount(
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  notes: string,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum
): Promise<AccountSaveResponse> {
  // 表单验证
  if (
    !siteName.trim() ||
    !username.trim() ||
    !accessToken.trim() ||
    !userId.trim()
  ) {
    return {
      success: false,
      message: t("messages:errors.validation.incompleteAccountInfo")
    }
  }

  const parsedUserId = parseInt(userId.trim())
  if (isNaN(parsedUserId)) {
    return {
      success: false,
      message: t("messages:errors.validation.userIdNumeric")
    }
  }

  try {
    // 获取账号余额和今日使用情况
    console.log(t("messages:toast.loading.fetchingAccountData"))
    const freshAccountData = await fetchAccountData(
      url.trim(),
      parsedUserId,
      accessToken.trim(),
      checkInConfig,
      authType
    )

    const accountData: Omit<SiteAccount, "id" | "created_at" | "updated_at"> = {
      emoji: "", // 不再使用 emoji
      site_name: siteName.trim(),
      site_url: url.trim(),
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: siteType,
      authType: authType,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT, // 使用用户输入的汇率
      notes: notes || "",
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
        today_income: freshAccountData.today_income
      },
      last_sync_time: Date.now()
    }

    const accountId = await accountStorage.addAccount(accountData)
    console.log(t("messages:toast.success.accountSaveSuccess"), {
      id: accountId,
      siteName,
      freshAccountData
    })

    return {
      success: true,
      message: t("messages:toast.success.accountSaveSuccess"),
      accountId
    }
  } catch (error) {
    console.error(
      t("messages:errors.operation.saveFailed", { error: "" }),
      error
    )
    const errorMessage = getErrorMessage(error)
    return {
      success: false,
      message: t("messages:errors.operation.saveFailed", {
        error: errorMessage
      })
    }
  }
}

// 验证并更新账号信息（用于编辑）
export async function validateAndUpdateAccount(
  accountId: string,
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  notes: string,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum
): Promise<AccountSaveResponse> {
  // 表单验证
  if (
    !siteName.trim() ||
    !username.trim() ||
    !accessToken.trim() ||
    !userId.trim()
  ) {
    return {
      success: false,
      message: t("messages:errors.validation.incompleteAccountInfo")
    }
  }

  const parsedUserId = parseInt(userId.trim())
  if (isNaN(parsedUserId)) {
    return {
      success: false,
      message: t("messages:errors.validation.userIdNumeric")
    }
  }

  try {
    // 获取账号余额和今日使用情况
    console.log(t("messages:toast.loading.fetchingAccountData"))
    const freshAccountData = await fetchAccountData(
      url.trim(),
      parsedUserId,
      accessToken.trim(),
      checkInConfig,
      authType
    )

    const updateData: Partial<Omit<SiteAccount, "id" | "created_at">> = {
      site_name: siteName.trim(),
      site_url: url.trim(),
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: siteType,
      authType: authType,
      exchange_rate:
        parseFloat(exchangeRate) || UI_CONSTANTS.EXCHANGE_RATE.DEFAULT, // 使用用户输入的汇率
      notes: notes,
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
        today_income: freshAccountData.today_income
      },
      last_sync_time: Date.now()
    }

    const success = await accountStorage.updateAccount(accountId, updateData)
    if (!success) {
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: ""
        })
      }
    }

    console.log(t("messages:toast.success.accountUpdateSuccess"), {
      id: accountId,
      siteName,
      freshAccountData
    })

    return {
      success: true,
      message: t("messages:toast.success.accountUpdateSuccess"),
      accountId
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error)
    console.error(
      t("messages:errors.validation.updateAccountFailed", {
        error: errorMessage
      }),
      error
    )
    return {
      success: false,
      message: t("messages:errors.validation.updateAccountFailed", {
        error: errorMessage
      })
    }
  }
}

// 提取域名的主要部分（一级域名前缀）
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

// 就是各个站点的system_name
const defaultSiteNameList = [
  "One API",
  "New API",
  "Veloera",
  "One Hub",
  "Done Hub",
  // 闭源未知，只能已进行猜测
  "VoAPI",
  "Super API",
  "Super-API"
]

function IsNotDefaultSiteName(siteName: string) {
  return !defaultSiteNameList.includes(siteName)
}

export async function getSiteName(
  input: browser.tabs.Tab | string
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
  const siteStatusInfo = await fetchSiteStatus(hostWithProtocol)
  if (
    siteStatusInfo?.system_name &&
    IsNotDefaultSiteName(siteStatusInfo.system_name)
  ) {
    return siteStatusInfo.system_name
  }

  // 5. 最后从域名获取
  return extractDomainPrefix(urlObj.hostname)
}

// 验证充值比例是否有效
export function isValidExchangeRate(rate: string): boolean {
  const num = parseFloat(rate)
  return !isNaN(num) && num > 0 && num <= 100
}

// Helper function to validate New API configuration
async function validateNewApiConfig(): Promise<{
  valid: boolean
  errors: string[]
}> {
  const prefs = await userPreferences.getPreferences()
  const errors = []

  if (!prefs.newApiBaseUrl) {
    errors.push(t("messages:errors.validation.newApiBaseUrlRequired"))
  }
  if (!prefs.newApiAdminToken) {
    errors.push(t("messages:errors.validation.newApiAdminTokenRequired"))
  }
  if (!prefs.newApiUserId) {
    errors.push(t("messages:errors.validation.newApiUserIdRequired"))
  }

  return {
    valid: errors.length === 0,
    errors
  }
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
    group: ""
  }
}

export async function autoConfigToNewApi(
  account: SiteAccount,
  toastId?: string
): Promise<NewApiResponse<{ token?: ApiToken }>> {
  const configValidation = await validateNewApiConfig()
  if (!configValidation.valid) {
    return { success: false, message: configValidation.errors.join(", ") }
  }

  const displaySiteData = accountStorage.convertToDisplayData(
    account
  ) as DisplaySiteData

  let lastError: any
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      toast.loading(t("messages:accountOperations.checkingApiKeys"), {
        id: toastId
      })
      // 1. Check for existing API token
      const tokens = await fetchAccountTokens(displaySiteData)
      let apiToken: ApiToken | undefined = tokens[0]

      // 2. Create a new token if one doesn't exist
      if (!apiToken) {
        const newTokenData = generateDefaultToken()
        const createApiTokenRsult = await createApiToken(
          account.site_url,
          account.account_info.id,
          account.account_info.access_token,
          newTokenData
        )
        if (!createApiTokenRsult) {
          return {
            success: false,
            message: t("messages:accountOperations.createTokenFailed")
          }
        }
        // Re-fetch tokens to get the newly created one
        const updatedTokens = await fetchAccountTokens(displaySiteData)
        apiToken = updatedTokens.at(-1)
      }

      if (!apiToken) {
        return {
          success: false,
          message: t("messages:accountOperations.tokenNotFound")
        }
      }

      // 3. Import to New API as a channel
      toast.loading(t("messages:accountOperations.importingToNewApi"), {
        id: toastId
      })
      const importResult = await importToNewApi(displaySiteData, apiToken)

      if (importResult.success) {
        toast.success(importResult.message, { id: toastId })
      } else {
        throw new Error(importResult.message)
      }

      return {
        success: importResult.success,
        message: importResult.message,
        data: { token: apiToken }
      }
    } catch (error) {
      lastError = error
      if (
        error instanceof Error &&
        (error.message.includes("network") ||
          error.message.includes("Failed to fetch")) &&
        attempt < 3
      ) {
        toast.error(getErrorMessage(lastError), { id: toastId })
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
        continue
      }
      throw error
    }
  }
  return {
    success: false,
    message: lastError?.message || t("messages:errors.unknown")
  }
}
