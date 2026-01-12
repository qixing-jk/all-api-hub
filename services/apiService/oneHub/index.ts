import type {
  ApiServiceRequest,
  PricingResponse,
} from "~/services/apiService/common/type"
import { fetchApiData } from "~/services/apiService/common/utils"
import type {
  OneHubModelPricing,
  OneHubUserGroupInfo,
  OneHubUserGroupMap,
  OneHubUserGroupsResponse,
  PaginatedTokenDate,
} from "~/services/apiService/oneHub/type"
import type { ApiToken } from "~/types"
import { normalizeApiTokenKey } from "~/utils/apiKey"
import {
  transformModelPricing,
  transformUserGroup,
} from "~/utils/dataTransform/one-hub"

export const fetchAvailableModel = async (request: ApiServiceRequest) => {
  return fetchApiData<OneHubModelPricing>(request, {
    endpoint: "/api/available_model",
  })
}

export const fetchUserGroupMap = async (request: ApiServiceRequest) => {
  return fetchApiData<OneHubUserGroupMap>(request, {
    endpoint: "/api/user_group_map",
  })
}
export const fetchModelPricing = async (
  request: ApiServiceRequest,
): Promise<PricingResponse> => {
  try {
    const [availableModel, userGroupMap] = await Promise.all([
      fetchAvailableModel(request),
      fetchUserGroupMap(request),
    ])

    const result = transformModelPricing(availableModel, userGroupMap)
    console.log(result)

    return result
  } catch (error) {
    console.error("获取模型定价失败:", error)
    throw error
  }
}

/**
 * 获取账号令牌列表
 */
export const fetchAccountTokens = async (
  request: ApiServiceRequest,
  page: number = 0,
  size: number = 100,
): Promise<ApiToken[]> => {
  const searchParams = new URLSearchParams({
    p: page.toString(),
    size: size.toString(),
  })

  try {
    // 尝试获取响应数据，可能是直接的数组或者分页对象
    const tokensData = await fetchApiData<PaginatedTokenDate>(request, {
      endpoint: `/api/token/?${searchParams.toString()}`,
    })

    // 处理不同的响应格式
    if (Array.isArray(tokensData)) {
      // 直接返回数组格式
      return tokensData.map(normalizeApiTokenKey)
    } else if (
      tokensData &&
      typeof tokensData === "object" &&
      "data" in tokensData
    ) {
      // 分页格式，返回 data 数组
      return (tokensData.data || []).map(normalizeApiTokenKey)
    } else {
      // 其他情况，返回空数组
      console.warn("Unexpected token response format:", tokensData)
      return []
    }
  } catch (error) {
    console.error("获取令牌列表失败:", error)
    throw error
  }
}

/**
 * 获取用户分组信息
 */
export const fetchUserGroups = async (
  request: ApiServiceRequest,
): Promise<Record<string, OneHubUserGroupInfo>> => {
  try {
    const response = await fetchApiData<OneHubUserGroupsResponse["data"]>(
      request,
      {
        endpoint: "/api/user_group_map",
      },
    )
    return transformUserGroup(response)
  } catch (error) {
    console.error("获取分组信息失败:", error)
    throw error
  }
}

/**
 * 获取可用模型列表
 */
export const fetchAccountAvailableModels = async (
  request: ApiServiceRequest,
) => {
  const availableModel = await fetchAvailableModel(request)
  return Object.keys(availableModel)
}
