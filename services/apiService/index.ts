import { DONE_HUB, ONE_HUB, type SiteType } from "~/constants/siteType"

import * as commonAPI from "./common"
import * as oneHubAPI from "./oneHub"

// 映射表,只放需要覆盖的站点
const siteOverrideMap = {
  [ONE_HUB]: oneHubAPI,
  [DONE_HUB]: oneHubAPI
} as const

// 添加类型定义
type SiteOverrideMap = typeof siteOverrideMap

// 获取对应站点的 API 函数
function getApiFunc<T extends keyof typeof commonAPI>(
  funcName: T,
  currentSite: SiteType = "default"
): (typeof commonAPI)[T] {
  const overrideModule =
    currentSite in siteOverrideMap
      ? siteOverrideMap[currentSite as keyof SiteOverrideMap]
      : null

  if (overrideModule && funcName in overrideModule) {
    // 使用类型断言避免索引类型错误
    return (overrideModule as any)[funcName] as (typeof commonAPI)[T]
  }
  return commonAPI[funcName] as (typeof commonAPI)[T]
}

// 创建包装函数的辅助函数
function createWrappedFunction<T extends (...args: any[]) => any>(
  funcName: keyof typeof commonAPI
): T {
  return ((...args: any[]) => {
    let currentSite: SiteType = "default"
    const lastArg = args[args.length - 1]

    if (typeof lastArg === "string" && lastArg in siteOverrideMap) {
      currentSite = lastArg as SiteType
      args.pop()
    } else {
      for (const arg of args) {
        if (arg && typeof arg === "object" && "siteType" in arg) {
          const candidate = arg.siteType
          if (typeof candidate === "string" && candidate in siteOverrideMap) {
            currentSite = candidate as SiteType
            break
          }
        }
      }
    }

    const targetFunc = getApiFunc(funcName, currentSite)
    // 使用类型断言避免 spread 参数类型错误
    return (targetFunc as any)(...args)
  }) as T
}

// 创建导出对象
const exportedAPI = {} as {
  [K in keyof typeof commonAPI]: (typeof commonAPI)[K]
}

// 遍历 commonAPI 并包装每个函数
for (const key in commonAPI) {
  const func = commonAPI[key as keyof typeof commonAPI]
  if (typeof func === "function") {
    ;(exportedAPI as any)[key] = createWrappedFunction(
      key as keyof typeof commonAPI
    )
  } else {
    ;(exportedAPI as any)[key] = func
  }
}

// 导出所有函数
export const {
  fetchUserInfo,
  createAccessToken,
  fetchSiteStatus,
  extractDefaultExchangeRate,
  getOrCreateAccessToken,
  fetchAccountQuota,
  fetchCheckInStatus,
  fetchSupportCheckIn,
  fetchTodayUsage,
  fetchTodayIncome,
  fetchAccountData,
  refreshAccountData,
  validateAccountConnection,
  fetchAccountTokens,
  fetchAvailableModels,
  fetchUpstreamModels,
  fetchUpstreamModelsNameList,
  fetchUserGroups,
  fetchSiteUserGroups,
  createApiToken,
  fetchTokenById,
  updateApiToken,
  deleteApiToken,
  fetchModelPricing,
  determineHealthStatus
} = exportedAPI

export { exportedAPI }
