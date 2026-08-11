import {
  normalizeApiTokenKey,
  validateApiTokenInventory,
} from "~/services/accountTokens/apiTokenKey"
import {
  invalidateResolvedApiTokenKeyCache,
  resolveApiTokenKey,
  syncResolvedApiTokenKeyCache,
} from "~/services/accountTokens/tokenKeyResolver"
import type {
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/accountTokens/tokenProvisioningModel"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchAllItems } from "~/services/apiTransport/pagination"
import { fetchApi, fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { isRecord } from "~/utils/core/object"

const logger = createLogger("NewApiFamilyKeyManagement")

type PaginatedTokenResponse = {
  page: number
  page_size: number
  total: number
  items: ApiToken[]
}

interface KeyManagementImplementation {
  fetchAccountTokens: (
    request: ApiServiceRequest,
    page?: number,
    size?: number,
  ) => Promise<ApiToken[]>
  fetchCompleteAccountTokens: (
    request: ApiServiceRequest,
  ) => Promise<ApiToken[]>
  fetchCurrentUserGroup: (request: ApiServiceRequest) => Promise<string>
  createApiToken: (
    request: ApiServiceRequest,
    tokenData: CreateTokenRequest,
  ) => Promise<CreateTokenResult>
  updateApiToken: (
    request: ApiServiceRequest,
    tokenId: number,
    tokenData: CreateTokenRequest,
  ) => Promise<boolean | void>
  resolveApiTokenKey: (
    request: ApiServiceRequest,
    token: Pick<ApiToken, "id" | "key">,
  ) => Promise<string>
  deleteApiToken: (
    request: ApiServiceRequest,
    tokenId: number,
  ) => Promise<boolean | void>
  fetchUserGroups: (
    request: ApiServiceRequest,
  ) => Promise<Record<string, UserGroupInfo>>
  fetchAccountAvailableModels: (request: ApiServiceRequest) => Promise<string[]>
}

const isCompleteFirstTokenPage = (
  response: PaginatedTokenResponse,
  page: number,
  size: number,
) =>
  page === 0 &&
  response.page === page &&
  response.page_size === size &&
  response.total <= response.items.length

/** Fetch one account-token page for ordinary key-management consumers. */
export async function fetchAccountTokens(
  request: ApiServiceRequest,
  page: number = 0,
  size: number = REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
): Promise<ApiToken[]> {
  const searchParams = new URLSearchParams({
    p: page.toString(),
    size: size.toString(),
  })

  try {
    const tokensData = await fetchApiData<unknown>(request, {
      endpoint: `/api/token/?${searchParams.toString()}`,
    })

    if (Array.isArray(tokensData)) {
      const normalizedTokens = tokensData.map(normalizeApiTokenKey)
      return normalizedTokens
    }

    if (isRecord(tokensData) && Array.isArray(tokensData.items)) {
      const normalizedTokens = tokensData.items.map(normalizeApiTokenKey)
      if (
        isCompleteFirstTokenPage(
          tokensData as PaginatedTokenResponse,
          page,
          size,
        )
      ) {
        syncResolvedApiTokenKeyCache(request, normalizedTokens)
      }
      return normalizedTokens
    }

    logger.warn("Unexpected token response format", {
      receivedType: Array.isArray(tokensData) ? "array" : typeof tokensData,
      keys: isRecord(tokensData) ? Object.keys(tokensData) : null,
    })
    return []
  } catch (error) {
    logger.error("获取令牌列表失败", error)
    throw error
  }
}

/**
 * Fetch a complete New API-family token inventory for native reconciliation.
 * New API normalizes `p=0` to page 1:
 * https://github.com/QuantumNous/new-api/blob/9c97e78aced572d540f227007a675d7d007666ac/common/page_info.go
 * One API and Veloera return bare paged arrays, which terminate on an empty page:
 * https://github.com/songquanpeng/one-api/blob/main/controller/token.go
 * https://github.com/Veloera/Veloera/blob/main/controller/token.go
 */
export async function fetchCompleteAccountTokens(
  request: ApiServiceRequest,
): Promise<ApiToken[]> {
  let firstPageWasNormalizedToOne = false
  const tokens = await fetchAllItems<ApiToken>(
    async (page) => {
      const upstreamPage =
        firstPageWasNormalizedToOne && page > 0 ? page + 1 : page
      const searchParams = new URLSearchParams({
        p: upstreamPage.toString(),
        size: REQUEST_CONFIG.DEFAULT_PAGE_SIZE.toString(),
      })
      const tokensData = await fetchApiData<unknown>(request, {
        endpoint: `/api/token/?${searchParams.toString()}`,
      })

      if (Array.isArray(tokensData)) {
        const items = tokensData.map(normalizeApiTokenKey)
        return { items, hasMore: items.length > 0 }
      }

      if (!isRecord(tokensData) || !Array.isArray(tokensData.items)) {
        throw new Error("invalid_token_page_payload")
      }

      if (page === 0 && tokensData.page === 1) {
        firstPageWasNormalizedToOne = true
      }
      const items = tokensData.items.map(normalizeApiTokenKey)
      return {
        items,
        hasMore: items.length > 0,
      }
    },
    {
      pageSize: REQUEST_CONFIG.DEFAULT_PAGE_SIZE,
      startPage: 0,
      requireComplete: true,
    },
  )

  const inventory = validateApiTokenInventory(tokens)
  syncResolvedApiTokenKeyCache(request, inventory)
  return inventory
}

/**
 * Fetch the list of downstream model identifiers that an account can access.
 */
export async function fetchAccountAvailableModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  try {
    return await fetchApiData<string[]>(request, {
      endpoint: "/api/user/models",
    })
  } catch (error) {
    logger.error("获取模型列表失败", error)
    throw error
  }
}

/**
 * Fetch user-group assignments for the authenticated account.
 */
export async function fetchUserGroups(
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> {
  try {
    return await fetchApiData<Record<string, UserGroupInfo>>(request, {
      endpoint: "/api/user/self/groups",
    })
  } catch (error) {
    logger.error("获取分组信息失败", error)
    throw error
  }
}

/**
 * Fetch the account group inherited by tokens whose own group is empty.
 * New API exposes the authenticated user's group in its self DTO:
 * https://github.com/QuantumNous/new-api/blob/3d5dc36f1d85ccae8d5cb2864764011795b559b5/controller/user.go
 */
export async function fetchCurrentUserGroup(
  request: ApiServiceRequest,
): Promise<string> {
  const userData = await fetchApiData<unknown>(request, {
    endpoint: "/api/user/self",
  })
  if (!isRecord(userData) || typeof userData.group !== "string") {
    throw new Error("invalid_current_user_group_payload")
  }
  const group = userData.group.trim()
  if (!group) throw new Error("invalid_current_user_group_payload")
  return group
}

/**
 * Fetch the complete list of user groups defined on the site.
 */
export async function fetchSiteUserGroups(
  request: ApiServiceRequest,
): Promise<Array<string>> {
  try {
    return await fetchApiData<Array<string>>(request, {
      endpoint: "/api/group",
    })
  } catch (error) {
    logger.error("获取站点分组信息失败", error)
    throw error
  }
}

/**
 * Create a new API token for the specified account.
 */
export async function createApiToken(
  request: ApiServiceRequest,
  tokenData: CreateTokenRequest,
): Promise<CreateTokenResult> {
  try {
    const response = await fetchApi<any>(request, {
      endpoint: "/api/token/",
      options: {
        method: "POST",
        body: JSON.stringify(tokenData),
      },
    })

    if (!response.success) {
      throw new ApiError(
        response.message || "创建令牌失败",
        undefined,
        "/api/token",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    }

    invalidateResolvedApiTokenKeyCache(request)
    return true
  } catch (error) {
    logger.error("创建令牌失败", error)
    throw error
  }
}

/**
 * Fetch a single API token by its identifier.
 */
export async function fetchTokenById(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<ApiToken> {
  try {
    const token = await fetchApiData<ApiToken>(request, {
      endpoint: `/api/token/${tokenId}`,
    })
    return normalizeApiTokenKey(token)
  } catch (error) {
    logger.error("获取令牌详情失败", error)
    throw error
  }
}

/**
 * Update an existing API token in place.
 */
export async function updateApiToken(
  request: ApiServiceRequest,
  tokenId: number,
  tokenData: CreateTokenRequest,
): Promise<boolean> {
  try {
    const response = await fetchApi<any>(request, {
      endpoint: "/api/token/",
      options: {
        method: "PUT",
        body: JSON.stringify({ ...tokenData, id: tokenId }),
      },
    })

    if (!response.success) {
      throw new ApiError(
        response.message || "更新令牌失败",
        undefined,
        "/api/token",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    }

    invalidateResolvedApiTokenKeyCache(request)
    return true
  } catch (error) {
    logger.error("更新令牌失败", error)
    throw error
  }
}

/**
 * Delete an API token permanently.
 */
export async function deleteApiToken(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<boolean> {
  try {
    const response = await fetchApi<any>(request, {
      endpoint: `/api/token/${tokenId}`,
      options: {
        method: "DELETE",
      },
    })

    if (!response.success) {
      throw new ApiError(
        response.message || "删除令牌失败",
        undefined,
        `/api/token/${tokenId}`,
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    }

    invalidateResolvedApiTokenKeyCache(request)
    return true
  } catch (error) {
    logger.error("删除令牌失败", error)
    throw error
  }
}

export const defaultKeyManagementImplementation: KeyManagementImplementation = {
  fetchAccountTokens,
  fetchCompleteAccountTokens,
  fetchCurrentUserGroup,
  createApiToken,
  updateApiToken,
  resolveApiTokenKey,
  deleteApiToken,
  fetchUserGroups,
  fetchAccountAvailableModels,
}
