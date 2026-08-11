import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import * as defaultTransport from "~/services/apiService/newApiFamily/default/keyManagement"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"

export type NewApiFamilyTokenTransport =
  typeof defaultTransport.defaultKeyManagementImplementation

const baseTransport: NewApiFamilyTokenTransport = {
  ...defaultTransport.defaultKeyManagementImplementation,
  fetchAccountTokens: defaultTransport.fetchAccountTokens,
  fetchCompleteAccountTokens: defaultTransport.fetchCompleteAccountTokens,
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
  fetchCompleteAccountTokens: oneHub.fetchCompleteAccountTokens,
  fetchUserGroups: oneHub.fetchUserGroups,
  fetchAccountAvailableModels: oneHub.fetchAccountAvailableModels,
}

const overrides: Partial<
  Record<AccountSiteType, Partial<NewApiFamilyTokenTransport>>
> = {
  [SITE_TYPES.ONE_HUB]: oneHubOverrides,
  [SITE_TYPES.DONE_HUB]: oneHubOverrides,
  [SITE_TYPES.WONG_GONGYI]: {
    resolveApiTokenKey: wong.resolveApiTokenKey,
  },
}

/** Resolves site-type-specific token transport without routing through product capabilities. */
export const resolveNewApiFamilyTokenTransport = (
  siteType: AccountSiteType,
): NewApiFamilyTokenTransport => ({
  ...baseTransport,
  ...overrides[siteType],
})
