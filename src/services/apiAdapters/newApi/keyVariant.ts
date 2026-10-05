import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/factory"
import type { AccountKeyDefaultCreationPolicy } from "~/services/apiAdapters/contracts/accountKeyResource"
import * as defaultTransport from "~/services/apiService/newApiFamily/default/keyManagement"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import * as apiyi from "~/services/apiService/newApiFamily/variants/apiyi"
import * as laozhang from "~/services/apiService/newApiFamily/variants/laozhang"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"
import { reportsRixApiV6TokenColumns } from "~/services/apiService/newApiFamily/variants/rixApiDialects"
import * as rixApiTokens from "~/services/apiService/newApiFamily/variants/rixApiTokens"
import * as vApi from "~/services/apiService/newApiFamily/variants/vApi"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import {
  createNewApiKeyGroupBehavior,
  NEW_API_KEY_GROUP_MODES,
} from "./keyGroupBehavior"
import type { NewApiKeyEditCommand } from "./keyResourceEditor"
import { withLaozhangKeySettings } from "./laozhangKeyResourceEditor"
import { readLaozhangPreservedTokenFields } from "./laozhangPreservedTokenFields"

export type NewApiFamilyTokenTransport =
  typeof defaultTransport.defaultKeyManagementImplementation & {
    fetchTokenById: typeof defaultTransport.fetchTokenById
  }

const baseTransport: NewApiFamilyTokenTransport = {
  fetchAccountTokens: defaultTransport.fetchAccountTokens,
  fetchTokenById: defaultTransport.fetchTokenById,
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

export type NewApiKeyVariant = {
  transport: NewApiFamilyTokenTransport
  group: ReturnType<typeof createNewApiKeyGroupBehavior>
  initialQuota: number
  defaultCreation: AccountKeyDefaultCreationPolicy
  readPreservedFields(token: NewApiToken): Record<string, unknown>
  readEditableToken(
    request: ApiServiceRequest,
    listed: NewApiToken,
  ): Promise<NewApiToken>
  exposesDeploymentFields(request: ApiServiceRequest): boolean
  extendEditor(
    editor: AccountKeyResourceEditorDefinition<NewApiKeyEditCommand>,
  ): AccountKeyResourceEditorDefinition<NewApiKeyEditCommand>
}

const overrides: Partial<
  Record<
    AccountSiteType,
    Omit<Partial<NewApiKeyVariant>, "transport"> & {
      transport?: Partial<NewApiFamilyTokenTransport>
    }
  >
> = {
  [SITE_TYPES.APIYI]: {
    transport: {
      // https://api.apiyi.com/ (v29.8.9) returns token arrays starting at p=0.
      ...compatibleTokenInventoryOverrides,
      fetchAccountAvailableModels: apiyi.fetchAccountAvailableModels,
      fetchUserGroups: apiyi.fetchUserGroups,
    },
  },
  [SITE_TYPES.ANYROUTER]: { transport: compatibleTokenInventoryOverrides },
  [SITE_TYPES.MODELFLARE]: {
    initialQuota: -1,
    defaultCreation: "select-requirement",
    group: createNewApiKeyGroupBehavior(NEW_API_KEY_GROUP_MODES.Required),
  },
  [SITE_TYPES.LAOZHANG]: {
    transport: {
      // https://api2.laozhang.ai/token v31.1.5: p=0/pageSize, bare arrays;
      // groupPro and available_model match the APIyi transport contract.
      fetchAccountTokens: laozhang.fetchAccountTokens,
      fetchTokenById: laozhang.fetchTokenById,
      fetchAccountAvailableModels: apiyi.fetchAccountAvailableModels,
      fetchUserGroups: apiyi.fetchUserGroups,
      createApiToken: laozhang.createApiToken,
      updateApiToken: laozhang.updateApiToken,
    },
    readPreservedFields: readLaozhangPreservedTokenFields,
    extendEditor: withLaozhangKeySettings,
    async readEditableToken(request, listed) {
      const detail = await laozhang.fetchTokenById(request, listed.id)
      if (detail.id !== listed.id || detail.user_id !== listed.user_id)
        throw new Error("token_identity_mismatch")
      return detail
    },
  },
  [SITE_TYPES.ONE_API]: {
    transport: oneApiTokenInventoryOverrides,
    group: createNewApiKeyGroupBehavior(NEW_API_KEY_GROUP_MODES.None),
  },
  [SITE_TYPES.VELOERA]: { transport: veloeraTokenInventoryOverrides },
  [SITE_TYPES.ONE_HUB]: { transport: oneHubOverrides },
  [SITE_TYPES.DONE_HUB]: { transport: oneHubOverrides },
  [SITE_TYPES.V_API]: {
    transport: {
      ...compatibleTokenInventoryOverrides,
      fetchAccountAvailableModels: vApi.fetchAccountAvailableModels,
      fetchUserGroups: vApi.fetchUserGroups,
    },
  },
  [SITE_TYPES.VO_API]: { transport: compatibleTokenInventoryOverrides },
  [SITE_TYPES.SUPER_API]: { transport: compatibleTokenInventoryOverrides },
  [SITE_TYPES.RIX_API]: {
    transport: {
      // The 6.x inventory normalizes `p=0` to its first page and reports string
      // quotas, groups and the revealable key through its own dialects.
      fetchAccountTokens: rixApiTokens.fetchAccountTokens,
      fetchTokenById: rixApiTokens.fetchTokenById,
      fetchUserGroups: rixApiTokens.fetchUserGroups,
      fetchCurrentUserGroup: rixApiTokens.fetchCurrentUserGroup,
      fetchAccountAvailableModels: rixApiTokens.fetchAccountAvailableModels,
      resolveApiTokenKey: rixApiTokens.resolveApiTokenKey,
    },
    readPreservedFields: rixApiTokens.readRixApiPreservedTokenFields,
    exposesDeploymentFields: (request) =>
      reportsRixApiV6TokenColumns(request.baseUrl),
  },
  [SITE_TYPES.NEO_API]: { transport: compatibleTokenInventoryOverrides },
  [SITE_TYPES.WONG_GONGYI]: {
    transport: {
      ...compatibleTokenInventoryOverrides,
      resolveApiTokenKey: wong.resolveApiTokenKey,
    },
  },
  [SITE_TYPES.UNKNOWN]: { transport: compatibleTokenInventoryOverrides },
}

/** Binds all account-key variant behavior together before shared orchestration runs. */
export function resolveNewApiKeyVariant(
  siteType?: AccountSiteType,
): NewApiKeyVariant {
  const variant = siteType ? overrides[siteType] : undefined
  return {
    group: createNewApiKeyGroupBehavior(),
    initialQuota: 0,
    defaultCreation: "editor-defaults",
    readPreservedFields: () => ({}),
    readEditableToken: async (_request, listed) => listed,
    exposesDeploymentFields: () => false,
    extendEditor: (editor) => editor,
    ...variant,
    transport: { ...baseTransport, ...variant?.transport },
  }
}
