import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import * as commonKeyManagement from "~/services/apiService/common"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import * as oneHubKeyManagement from "~/services/apiService/oneHub"
import * as wongKeyManagement from "~/services/apiService/wong"
import type {
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/tokenProvisioning/model"
import type { ApiToken } from "~/types"

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

const defaultKeyManagementImplementation: KeyManagementImplementation = {
  fetchAccountTokens: commonKeyManagement.fetchAccountTokens,
  createApiToken: commonKeyManagement.createApiToken,
  updateApiToken: commonKeyManagement.updateApiToken,
  resolveApiTokenKey: commonKeyManagement.resolveApiTokenKey,
  deleteApiToken: commonKeyManagement.deleteApiToken,
  fetchUserGroups: commonKeyManagement.fetchUserGroups,
  fetchAccountAvailableModels: commonKeyManagement.fetchAccountAvailableModels,
}

const oneHubKeyManagementOverrides: Partial<KeyManagementImplementation> = {
  fetchAccountTokens: oneHubKeyManagement.fetchAccountTokens,
  fetchUserGroups: oneHubKeyManagement.fetchUserGroups,
  fetchAccountAvailableModels: oneHubKeyManagement.fetchAccountAvailableModels,
}

const keyManagementOverrides: Partial<
  Record<AccountSiteType, Partial<KeyManagementImplementation>>
> = {
  [SITE_TYPES.ONE_HUB]: oneHubKeyManagementOverrides,
  [SITE_TYPES.DONE_HUB]: oneHubKeyManagementOverrides,
  [SITE_TYPES.WONG_GONGYI]: {
    resolveApiTokenKey: wongKeyManagement.resolveApiTokenKey,
  },
}

const getKeyManagementImplementation = (
  siteType: AccountSiteType,
): KeyManagementImplementation => ({
  ...defaultKeyManagementImplementation,
  ...keyManagementOverrides[siteType],
})

/**
 * Create key-management operations bound to a New API-family site type.
 */
export function createKeyManagementImplementation(
  siteType: AccountSiteType,
): KeyManagementImplementation {
  const implementation = getKeyManagementImplementation(siteType)

  return {
    fetchAccountTokens: (request, page, size) =>
      implementation.fetchAccountTokens(request, page ?? 0, size ?? 100),
    createApiToken: (request, tokenData) =>
      implementation.createApiToken(request, tokenData),
    updateApiToken: (request, tokenId, tokenData) =>
      implementation.updateApiToken(request, tokenId, tokenData),
    resolveApiTokenKey: (request, token) =>
      implementation.resolveApiTokenKey(request, token),
    deleteApiToken: (request, tokenId) =>
      implementation.deleteApiToken(request, tokenId),
    fetchUserGroups: (request) => implementation.fetchUserGroups(request),
    fetchAccountAvailableModels: (request) =>
      implementation.fetchAccountAvailableModels(request),
  }
}
