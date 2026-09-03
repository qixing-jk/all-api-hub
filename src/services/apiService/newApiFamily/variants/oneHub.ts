import { normalizeApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import { syncResolvedApiTokenKeyCache } from "~/services/accountTokens/tokenKeyResolver"
import type { UserGroupInfo } from "~/services/accountTokens/tokenProvisioningModel"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  transformModelPricing,
  transformUserGroup,
} from "~/services/apiService/oneHub/transform"
import type {
  OneHubModelPricing,
  OneHubUserGroupMap,
  OneHubUserGroupsResponse,
} from "~/services/apiService/oneHub/type"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import {
  fetchAllItems,
  inferHasMoreFromNumberedPage,
} from "~/services/apiTransport/pagination"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import type { ApiToken } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { isRecord } from "~/utils/core/object"

const logger = createLogger("NewApiFamily.OneHub")

export const fetchAvailableModel = async (request: ApiServiceRequest) => {
  return newApiFamilyRequests.data<OneHubModelPricing>(request, {
    endpoint: "/api/available_model",
  })
}

export const fetchUserGroupMap = async (request: ApiServiceRequest) => {
  return newApiFamilyRequests.data<OneHubUserGroupMap>(request, {
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
 * Fetch the complete token list using OneHub's one-based pagination.
 * OneHub and DoneHub return `page`, `size`, and `total_count` with their token
 * data. Coherent metadata is authoritative; incompatible or stale deployments
 * fall back to an empty-page completion signal.
 * Sources:
 * https://github.com/MartialBE/one-hub/blob/387f8bf16ed0d601fdede7ade378adb10aa1a35a/model/common.go
 * https://github.com/deanxv/done-hub/blob/main/model/common.go
 */
export const fetchAccountTokens = async (
  request: ApiServiceRequest,
): Promise<ApiToken[]> => {
  const tokens = await fetchAllItems<ApiToken>(
    async (page) => {
      const upstreamPage = page + 1
      const searchParams = new URLSearchParams({
        page: upstreamPage.toString(),
        size: REQUEST_CONFIG.DEFAULT_PAGE_SIZE.toString(),
      })
      const tokensData = await newApiFamilyRequests.data<unknown>(request, {
        endpoint: `/api/token/?${searchParams.toString()}`,
      })

      if (Array.isArray(tokensData)) {
        const items = tokensData.map(normalizeApiTokenKey)
        return { items, hasMore: items.length > 0 }
      }

      if (!isRecord(tokensData) || !Array.isArray(tokensData.data)) {
        throw new Error("invalid_token_page_payload")
      }
      const items = tokensData.data.map(normalizeApiTokenKey)
      const metadataHasMore = inferHasMoreFromNumberedPage({
        requestedPage: upstreamPage,
        responsePage: tokensData.page,
        responsePageSize: tokensData.size,
        total: tokensData.total_count,
        itemCount: items.length,
      })
      return {
        items,
        hasMore: metadataHasMore ?? items.length > 0,
      }
    },
    {
      pageSize: REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
      startPage: 0,
      requireComplete: true,
    },
  )

  syncResolvedApiTokenKeyCache(request, tokens)
  return tokens
}

/**
 * Fetch OneHub-compatible user-group information.
 */
export const fetchUserGroups = async (
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> => {
  try {
    const response = await newApiFamilyRequests.data<
      OneHubUserGroupsResponse["data"]
    >(request, {
      endpoint: "/api/user_group_map",
    })
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
