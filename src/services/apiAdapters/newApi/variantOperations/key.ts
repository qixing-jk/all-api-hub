import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import type { AccountKeyDefaultCreationPolicy } from "~/services/apiAdapters/contracts/accountKeyResource"
import { createNewApiKeyGroupBehavior } from "~/services/apiAdapters/newApi/keys/keyGroupBehavior"
import type { NewApiKeyEditCommand } from "~/services/apiAdapters/newApi/keys/keyResourceEditor"
import * as defaultTransport from "~/services/apiService/newApiFamily/default/keyManagement"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

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

export const oneHubOverrides: Partial<NewApiFamilyTokenTransport> = {
  fetchAccountTokens: oneHub.fetchAccountTokens,
  fetchUserGroups: oneHub.fetchUserGroups,
  fetchAccountAvailableModels: oneHub.fetchAccountAvailableModels,
}

export const oneApiTokenInventoryOverrides: Partial<NewApiFamilyTokenTransport> =
  {
    fetchAccountTokens: (request) =>
      defaultTransport.fetchAccountTokens(request, {
        startPage: 0,
        trustsRequestedPageSize: false,
      }),
  }

export const veloeraTokenInventoryOverrides: Partial<NewApiFamilyTokenTransport> =
  {
    fetchAccountTokens: (request) =>
      defaultTransport.fetchAccountTokens(request, {
        startPage: 0,
        trustsRequestedPageSize: true,
      }),
  }

export const compatibleTokenInventoryOverrides: Partial<NewApiFamilyTokenTransport> =
  {
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

/** Site-owned differences are completed against the shared key behavior. */
export type NewApiKeyVariantOverride = Omit<
  Partial<NewApiKeyVariant>,
  "transport"
> & { transport?: Partial<NewApiFamilyTokenTransport> }

/** Completes a site-owned key behavior without exposing selection to callers. */
export function createNewApiKeyVariant(
  variant: NewApiKeyVariantOverride = {},
): NewApiKeyVariant {
  return {
    group: createNewApiKeyGroupBehavior(),
    initialQuota: 0,
    defaultCreation: "editor-defaults",
    readPreservedFields: () => ({}),
    readEditableToken: async (_request, listed) => listed,
    exposesDeploymentFields: () => false,
    extendEditor: (editor) => editor,
    ...variant,
    transport: { ...baseTransport, ...variant.transport },
  }
}
