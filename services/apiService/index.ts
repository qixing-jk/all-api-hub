import {
  DONE_HUB,
  NEW_API,
  ONE_HUB,
  VELOERA,
  type SiteType,
} from "~/constants/siteType"

import * as commonAPI from "./common"
import * as oneHubAPI from "./oneHub"
import * as veloeraAPI from "./veloera"

export { fetchUpstreamModels, fetchUpstreamModelsNameList } from "./openai"

// 映射表,只放需要覆盖的站点
const siteOverrideMap = {
  [ONE_HUB]: oneHubAPI,
  [DONE_HUB]: oneHubAPI,
  [VELOERA]: veloeraAPI,
  [NEW_API]: commonAPI,
} as const

// 添加类型定义
type SiteOverrideMap = typeof siteOverrideMap

export type ApiOverrideSite = keyof SiteOverrideMap

/**
 * Append an optional SiteType hint to a function signature.
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
 * @returns The concrete function reference sourced from overrides or common.
 */
function getApiFunc<T extends keyof typeof commonAPI>(
  funcName: T,
  currentSite: SiteType = "default",
): (typeof commonAPI)[T] {
  const overrideModule =
    currentSite in siteOverrideMap
      ? siteOverrideMap[currentSite as keyof SiteOverrideMap]
      : null

  if (overrideModule && funcName in overrideModule) {
    // 使用类型断言避免索引类型错误
    return (overrideModule as any)[funcName] as (typeof commonAPI)[T]
  }
  // eslint-disable-next-line import/namespace
  return commonAPI[funcName] as (typeof commonAPI)[T]
}

// 创建包装函数的辅助函数
/**
 * Factory that wraps public API helpers with automatic site detection.
 * @param funcName Name of the helper being wrapped.
 * @returns A proxy function that inspects arguments for site hints.
 */
function createWrappedFunction<T extends (...args: any[]) => any>(
  funcName: keyof typeof commonAPI,
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

const createSiteScopedFunction = <T extends (...args: any[]) => any>(
  funcName: keyof typeof commonAPI,
  site: ApiOverrideSite,
): T => {
  return ((...args: any[]) => {
    const targetFunc = getApiFunc(funcName, site)
    return (targetFunc as any)(...args)
  }) as T
}

export const apiForSite = (site: ApiOverrideSite) => {
  const scopedAPI = {} as {
    [K in keyof typeof commonAPI]: (typeof commonAPI)[K]
  }

  for (const key in commonAPI) {
    // eslint-disable-next-line import/namespace
    const func = commonAPI[key as keyof typeof commonAPI]
    if (typeof func === "function") {
      ;(scopedAPI as any)[key] = createSiteScopedFunction(
        key as keyof typeof commonAPI,
        site,
      )
    } else {
      ;(scopedAPI as any)[key] = func
    }
  }

  return scopedAPI
}

export const isApiOverrideSite = (value: unknown): value is ApiOverrideSite =>
  typeof value === "string" && value in siteOverrideMap

export const getApiService = (site: unknown) =>
  (isApiOverrideSite(site)
    ? apiForSite(site)
    : exportedAPI) as typeof exportedAPI

// 创建导出对象
const exportedAPI = {} as {
  [K in keyof typeof commonAPI]: WithSiteHint<(typeof commonAPI)[K]>
}

// 遍历 commonAPI 并包装每个函数
for (const key in commonAPI) {
  // eslint-disable-next-line import/namespace
  const func = commonAPI[key as keyof typeof commonAPI]
  if (typeof func === "function") {
    ;(exportedAPI as any)[key] = createWrappedFunction(
      key as keyof typeof commonAPI,
    )
  } else {
    ;(exportedAPI as any)[key] = func
  }
}

export type ApiService = typeof exportedAPI
