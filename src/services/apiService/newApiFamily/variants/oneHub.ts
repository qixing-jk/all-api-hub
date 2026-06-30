import { normalizeApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import type { UserGroupInfo } from "~/services/accountTokens/tokenProvisioningModel"
import {
  transformModelPricing,
  transformUserGroup,
} from "~/services/apiService/oneHub/transform"
import type {
  OneHubModelPricing,
  OneHubUserGroupMap,
  OneHubUserGroupsResponse,
  PaginatedTokenDate,
} from "~/services/apiService/oneHub/type"
import { fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import type { ApiToken } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamily.OneHub")

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

/**
 * Fetch OneHub-compatible model pricing.
 */
export const fetchModelPricing = async (
  request: ApiServiceRequest,
): Promise<PricingResponse> => {
  try {
    const [availableModel, userGroupMap] = await Promise.all([
      fetchAvailableModel(request),
      fetchUserGroupMap(request),
    ])

    const result = transformModelPricing(availableModel, userGroupMap)
    logger.debug("Fetched model pricing")

    return result
  } catch (error) {
    logger.error("获取模型定价失败", error)
    throw error
  }
}

/**
 * Fetch OneHub-compatible account tokens.
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
    const tokensData = await fetchApiData<PaginatedTokenDate>(request, {
      endpoint: `/api/token/?${searchParams.toString()}`,
    })

    if (Array.isArray(tokensData)) {
      return tokensData.map(normalizeApiTokenKey)
    }

    if (tokensData && typeof tokensData === "object" && "data" in tokensData) {
      return (tokensData.data || []).map(normalizeApiTokenKey)
    }

    logger.warn("Unexpected token response format", {
      responseType: tokensData === null ? "null" : typeof tokensData,
    })
    return []
  } catch (error) {
    logger.error("获取令牌列表失败", error)
    throw error
  }
}

/**
 * Fetch OneHub-compatible user-group information.
 */
export const fetchUserGroups = async (
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> => {
  try {
    const response = await fetchApiData<OneHubUserGroupsResponse["data"]>(
      request,
      {
        endpoint: "/api/user_group_map",
      },
    )
    return transformUserGroup(response)
  } catch (error) {
    logger.error("获取分组信息失败", error)
    throw error
  }
}

/**
 * Fetch OneHub-compatible account available models.
 */
export const fetchAccountAvailableModels = async (
  request: ApiServiceRequest,
) => {
  const availableModel = await fetchAvailableModel(request)
  return Object.keys(availableModel)
}
