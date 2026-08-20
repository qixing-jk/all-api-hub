import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import * as defaultTransport from "~/services/apiService/newApiFamily/default/keyManagement"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"
import * as vApi from "~/services/apiService/newApiFamily/variants/vApi"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"

export type NewApiFamilyTokenTransport =
  typeof defaultTransport.defaultKeyManagementImplementation

const baseTransport: NewApiFamilyTokenTransport = {
  ...defaultTransport.defaultKeyManagementImplementation,
  fetchAccountTokens: defaultTransport.fetchAccountTokens,
  fetchCurrentUserGroup: defaultTransport.fetchCurrentUserGroup,
  createApiToken: defaultTransport.createApiToken,
  updateApiToken: defaultTransport.updateApiToken,
  resolveApiTokenKey:
    defaultTransport.defaultKeyManagementImplementation.resolveApiTokenKey,
  deleteApiToken: defaultTransport.deleteApiToken,
  fetchUserGroups: defaultTransport.fetchUserGroups,
  fetchAccountAvailableModels: defaultTransport.fetchAccountAvailableModels,
}

const oneHubOverrides: Partial<NewApiFamilyTokenTransport> = {
  fetchAccountTokens: oneHub.fetchAccountTokens,
  fetchUserGroups: oneHub.fetchUserGroups,
  fetchAccountAvailableModels: oneHub.fetchAccountAvailableModels,
}

const oneApiTokenInventoryOverrides: Partial<NewApiFamilyTokenTransport> = {
  fetchAccountTokens: (request) =>
    defaultTransport.fetchAccountTokens(request, {
      startPage: 0,
      trustsRequestedPageSize: false,
    }),
}

const veloeraTokenInventoryOverrides: Partial<NewApiFamilyTokenTransport> = {
  fetchAccountTokens: (request) =>
    defaultTransport.fetchAccountTokens(request, {
      startPage: 0,
      trustsRequestedPageSize: true,
    }),
}

const compatibleTokenInventoryOverrides: Partial<NewApiFamilyTokenTransport> = {
  fetchAccountTokens: (request) =>
    defaultTransport.fetchAccountTokens(request, {
      startPage: 0,
      detectsNormalizedFirstPage: true,
    }),
}

const overrides: Partial<
  Record<AccountSiteType, Partial<NewApiFamilyTokenTransport>>
> = {
  [SITE_TYPES.ANYROUTER]: compatibleTokenInventoryOverrides,
  [SITE_TYPES.ONE_API]: oneApiTokenInventoryOverrides,
  [SITE_TYPES.VELOERA]: veloeraTokenInventoryOverrides,
  [SITE_TYPES.ONE_HUB]: oneHubOverrides,
  [SITE_TYPES.DONE_HUB]: oneHubOverrides,
  [SITE_TYPES.V_API]: {
    ...compatibleTokenInventoryOverrides,
    fetchAccountAvailableModels: vApi.fetchAccountAvailableModels,
  },
  [SITE_TYPES.VO_API]: compatibleTokenInventoryOverrides,
  [SITE_TYPES.SUPER_API]: compatibleTokenInventoryOverrides,
  [SITE_TYPES.RIX_API]: compatibleTokenInventoryOverrides,
  [SITE_TYPES.NEO_API]: compatibleTokenInventoryOverrides,
  [SITE_TYPES.WONG_GONGYI]: {
    ...compatibleTokenInventoryOverrides,
    resolveApiTokenKey: wong.resolveApiTokenKey,
  },
  [SITE_TYPES.UNKNOWN]: compatibleTokenInventoryOverrides,
}

/** Resolves site-type-specific token transport without routing through product capabilities. */
export const resolveNewApiFamilyTokenTransport = (
  siteType: AccountSiteType,
): NewApiFamilyTokenTransport => ({
  ...baseTransport,
  ...overrides[siteType],
})
