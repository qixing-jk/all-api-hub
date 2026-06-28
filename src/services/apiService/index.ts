import { SITE_TYPES } from "~/constants/siteType"

import * as aihubmixAPI from "./aihubmix"
import * as anyrouterAPI from "./anyrouter"
import * as axonHubAPI from "./axonHub"
import * as commonAPI from "./common"
import * as doneHubAPI from "./doneHub"
import * as newApiFamilyChannelManagement from "./newApiFamily/channelManagement"
import * as newApiFamilyAccountBootstrap from "./newApiFamily/default/accountBootstrap"
import * as newApiFamilyAccountData from "./newApiFamily/default/accountData"
import * as newApiFamilyAccountRefresh from "./newApiFamily/default/accountRefresh"
import * as newApiFamilyKeyManagement from "./newApiFamily/default/keyManagement"
import * as newApiFamilyModelPricing from "./newApiFamily/default/modelPricing"
import * as newApiFamilyRedemption from "./newApiFamily/default/redemption"
import * as newApiFamilySiteNotice from "./newApiFamily/default/siteNotice"
import * as octopusAPI from "./octopus"
import * as oneHubAPI from "./oneHub"
import * as sub2apiAPI from "./sub2api"
import * as veloeraAPI from "./veloera"
import * as wongAPI from "./wong"

type ApiOverrideModule = Record<string, unknown>

const newApiFamilyKeyManagementLegacyAPI = {
  fetchAccountTokens: newApiFamilyKeyManagement.fetchAccountTokens,
  fetchAccountAvailableModels:
    newApiFamilyKeyManagement.fetchAccountAvailableModels,
  fetchUserGroups: newApiFamilyKeyManagement.fetchUserGroups,
  fetchSiteUserGroups: newApiFamilyKeyManagement.fetchSiteUserGroups,
  createApiToken: newApiFamilyKeyManagement.createApiToken,
  fetchTokenById: newApiFamilyKeyManagement.fetchTokenById,
  updateApiToken: newApiFamilyKeyManagement.updateApiToken,
  deleteApiToken: newApiFamilyKeyManagement.deleteApiToken,
  resolveApiTokenKey: newApiFamilyKeyManagement.resolveApiTokenKey,
}

const newApiFamilyAccountLifecycleLegacyAPI = {
  fetchAccountQuota: newApiFamilyAccountData.fetchAccountQuota,
  fetchCheckInStatus: newApiFamilyAccountData.fetchCheckInStatus,
  fetchTodayUsage: newApiFamilyAccountData.fetchTodayUsage,
  fetchTodayIncome: newApiFamilyAccountData.fetchTodayIncome,
  fetchAccountData: newApiFamilyAccountData.fetchAccountData,
  refreshAccountData: newApiFamilyAccountRefresh.refreshAccountData,
  validateAccountConnection:
    newApiFamilyAccountRefresh.validateAccountConnection,
}

const newApiFamilyAccountBootstrapLegacyAPI = {
  fetchUserInfo: newApiFamilyAccountBootstrap.fetchUserInfo,
  createAccessToken: newApiFamilyAccountBootstrap.createAccessToken,
  getOrCreateAccessToken: newApiFamilyAccountBootstrap.getOrCreateAccessToken,
  fetchSupportCheckIn: newApiFamilyAccountBootstrap.fetchSupportCheckIn,
  fetchSiteStatus: newApiFamilyAccountBootstrap.fetchSiteStatus,
  extractDefaultExchangeRate:
    newApiFamilyAccountBootstrap.extractDefaultExchangeRate,
}

const baseAPI = {
  ...commonAPI,
  ...newApiFamilyAccountBootstrapLegacyAPI,
  ...newApiFamilyAccountLifecycleLegacyAPI,
  ...newApiFamilyChannelManagement,
  ...newApiFamilyKeyManagementLegacyAPI,
  fetchSiteNotice: newApiFamilySiteNotice.fetchSiteNotice,
  fetchModelPricing: newApiFamilyModelPricing.fetchModelPricing,
  redeemCode: newApiFamilyRedemption.redeemCode,
}

/**
 * Legacy compatibility facade for managed-site and unmigrated flat API callers.
 *
 * Account-site capabilities are owned by the site-adapter seam and the
 * newApiFamily implementation modules. Do not add new account capability facts
 * here or route migrated adapters back through getApiService.
 */
// 映射表,只放需要覆盖的站点
const siteOverrideMap = {
  [SITE_TYPES.ONE_HUB]: [oneHubAPI],
  [SITE_TYPES.DONE_HUB]: [doneHubAPI, oneHubAPI],
  [SITE_TYPES.VELOERA]: [veloeraAPI],
  [SITE_TYPES.ANYROUTER]: [anyrouterAPI],
  [SITE_TYPES.NEW_API]: [
    newApiFamilyAccountBootstrapLegacyAPI,
    newApiFamilyAccountLifecycleLegacyAPI,
    newApiFamilyChannelManagement,
    newApiFamilyKeyManagementLegacyAPI,
    commonAPI,
  ],
  [SITE_TYPES.V_API]: [
    newApiFamilyAccountBootstrapLegacyAPI,
    newApiFamilyAccountLifecycleLegacyAPI,
    newApiFamilyChannelManagement,
    newApiFamilyKeyManagementLegacyAPI,
    commonAPI,
  ],
  [SITE_TYPES.WONG_GONGYI]: [wongAPI],
  [SITE_TYPES.SUB2API]: [sub2apiAPI],
  [SITE_TYPES.OCTOPUS]: [octopusAPI],
  [SITE_TYPES.AXON_HUB]: [axonHubAPI],
  [SITE_TYPES.AIHUBMIX]: [aihubmixAPI],
} as const

// 添加类型定义
type SiteOverrideMap = typeof siteOverrideMap

export type ApiOverrideSite = keyof SiteOverrideMap

const strictOverrideSites = new Set<ApiOverrideSite>([
  SITE_TYPES.AIHUBMIX,
  SITE_TYPES.SUB2API,
])

const hasOwnOverrideSite = (value: unknown): value is ApiOverrideSite =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(siteOverrideMap, value)

/**
 * Append an optional ApiOverrideSite hint to a function signature.
 * This allows callers to explicitly request a site/version implementation
 * without changing the underlying common API function shapes.
 */
type WithSiteHint<F> = F extends (...args: infer A) => infer R
  ? (...args: [...A, ApiOverrideSite?]) => R
  : F

// 获取对应站点的 API 函数
/**
 * Resolve an API implementation taking site overrides into account.
 * @param funcName Name of the API helper to retrieve.
 * @param currentSite Site identifier used to look up overrides.
 * @returns The concrete function reference sourced from overrides or base API.
 */
function getApiFunc<T extends keyof typeof baseAPI>(
  funcName: T,
  currentSite: ApiOverrideSite | null = null,
): (typeof baseAPI)[T] {
  const overrideModules =
    currentSite && hasOwnOverrideSite(currentSite)
      ? (siteOverrideMap[currentSite] as readonly ApiOverrideModule[])
      : null

  if (overrideModules) {
    for (const overrideModule of overrideModules) {
      if (overrideModule && funcName in overrideModule) {
        // 使用类型断言避免索引类型错误
        return (overrideModule as any)[funcName] as (typeof baseAPI)[T]
      }
    }

    if (currentSite && strictOverrideSites.has(currentSite)) {
      throw new Error(
        `apiService.${String(funcName)} is not implemented for ${currentSite}`,
      )
    }
  }
  return baseAPI[funcName] as (typeof baseAPI)[T]
}

// 创建包装函数的辅助函数
/**
 * Factory that wraps public API helpers with automatic site detection.
 * @param funcName Name of the helper being wrapped.
 * @returns A proxy function that inspects arguments for site hints.
 */
function createWrappedFunction<T extends (...args: any[]) => any>(
  funcName: keyof typeof baseAPI,
): T {
  return ((...args: any[]) => {
    let currentSite: ApiOverrideSite | null = null
    const lastArg = args[args.length - 1]

    if (hasOwnOverrideSite(lastArg)) {
      currentSite = lastArg
      args.pop()
    } else {
      for (const arg of args) {
        if (arg && typeof arg === "object" && "siteType" in arg) {
          const candidate = arg.siteType
          if (hasOwnOverrideSite(candidate)) {
            currentSite = candidate
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

const createSiteScopedFunction = <T extends (...args: any[]) => any>(
  funcName: keyof typeof baseAPI,
  site: ApiOverrideSite,
): T => {
  return ((...args: any[]) => {
    const targetFunc = getApiFunc(funcName, site)
    return (targetFunc as any)(...args)
  }) as T
}

const apiForSite = (site: ApiOverrideSite) => {
  const scopedAPI = {} as {
    [K in keyof typeof baseAPI]: (typeof baseAPI)[K]
  }

  for (const key in baseAPI) {
    const func = baseAPI[key as keyof typeof baseAPI]
    if (typeof func === "function") {
      ;(scopedAPI as any)[key] = createSiteScopedFunction(
        key as keyof typeof baseAPI,
        site,
      )
    } else {
      ;(scopedAPI as any)[key] = func
    }
  }

  return scopedAPI
}

const isApiOverrideSite = (value: unknown): value is ApiOverrideSite =>
  hasOwnOverrideSite(value)

export const getApiService = (site: unknown) =>
  (isApiOverrideSite(site)
    ? apiForSite(site)
    : exportedAPI) as typeof exportedAPI

// 创建导出对象
const exportedAPI = {} as {
  [K in keyof typeof baseAPI]: WithSiteHint<(typeof baseAPI)[K]>
}

// Wrap the legacy facade surface, including common helpers and New API-family extras.
for (const key in baseAPI) {
  const func = baseAPI[key as keyof typeof baseAPI]
  if (typeof func === "function") {
    ;(exportedAPI as any)[key] = createWrappedFunction(
      key as keyof typeof baseAPI,
    )
  } else {
    ;(exportedAPI as any)[key] = func
  }
}
