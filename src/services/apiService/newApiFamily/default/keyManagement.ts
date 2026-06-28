import { normalizeApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import type {
  CreateTokenRequest,
  CreateTokenResult,
  PaginatedTokenResponse,
  UserGroupInfo,
} from "~/services/accountTokens/tokenProvisioningModel"
import { ApiError } from "~/services/apiService/common/errors"
import {
  invalidateResolvedApiTokenKeyCache,
  resolveApiTokenKey,
  syncResolvedApiTokenKeyCache,
} from "~/services/apiService/common/tokenKeyResolver"
import { fetchApi, fetchApiData } from "~/services/apiService/common/utils"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken } from "~/types"
import { createLogger } from "~/utils/core/logger"

export { resolveApiTokenKey } from "~/services/apiService/common/tokenKeyResolver"

const logger = createLogger("NewApiFamilyKeyManagement")

interface KeyManagementImplementation {
  fetchAccountTokens: (
    request: ApiServiceRequest,
    page?: number,
    size?: number,
  ) => Promise<ApiToken[]>
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

/**
 * Fetch the API token list for a user and normalize multiple response shapes.
 */
export async function fetchAccountTokens(
  request: ApiServiceRequest,
  page: number = 0,
  size: number = 100,
): Promise<ApiToken[]> {
  const searchParams = new URLSearchParams({
    p: page.toString(),
    size: size.toString(),
  })

  try {
    const tokensData = await fetchApiData<ApiToken[] | PaginatedTokenResponse>(
      request,
      {
        endpoint: `/api/token/?${searchParams.toString()}`,
      },
    )

    if (Array.isArray(tokensData)) {
      const normalizedTokens = tokensData.map(normalizeApiTokenKey)
      syncResolvedApiTokenKeyCache(request, normalizedTokens)
      return normalizedTokens
    }

    if (tokensData && typeof tokensData === "object" && "items" in tokensData) {
      const normalizedTokens = (tokensData.items || []).map(
        normalizeApiTokenKey,
      )
      if (isCompleteFirstTokenPage(tokensData, page, size)) {
        syncResolvedApiTokenKeyCache(request, normalizedTokens)
      }
      return normalizedTokens
    }

    logger.warn("Unexpected token response format", {
      receivedType: Array.isArray(tokensData) ? "array" : typeof tokensData,
      keys:
        tokensData && typeof tokensData === "object"
          ? Object.keys(tokensData as any)
          : null,
    })
    return []
  } catch (error) {
    logger.error("获取令牌列表失败", error)
    throw error
  }
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
  createApiToken,
  updateApiToken,
  resolveApiTokenKey,
  deleteApiToken,
  fetchUserGroups,
  fetchAccountAvailableModels,
}
