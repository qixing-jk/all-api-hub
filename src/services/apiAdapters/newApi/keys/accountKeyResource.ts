import type { AccountSiteType } from "~/constants/siteType"
import type { AccountKeyResourcePage } from "~/services/apiAdapters/accountKeyResources/definition"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure as mapFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import { type AccountKeyScope } from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { toFacts } from "~/services/apiAdapters/newApi/keys/accountKeyDisplayFacts"
import {
  ACCOUNT_SCOPE_KEY,
  decodeTokenId,
  encodeTokenId,
  requireTokenId,
} from "~/services/apiAdapters/newApi/keys/accountKeyIdentity"
import {
  collectValidatedInventoryTokens,
  readEditableToken,
  resolveRuntimeKey,
} from "~/services/apiAdapters/newApi/keys/accountKeyInventory"
import {
  createNewApiAccountToken,
  deleteNewApiAccountToken,
  updateNewApiAccountToken,
} from "~/services/apiAdapters/newApi/keys/accountKeyMutations"
import {
  inspectProvisioning,
  provisionRequirement,
  renameProvisionedResource,
} from "~/services/apiAdapters/newApi/keys/accountKeyProvisioning"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keys/keyResourceEditor"
import { resolveNewApiKeyVariant } from "~/services/apiAdapters/newApi/keys/keyVariant"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"

/** Creates the New API-family native account-token resource capability. */
export const createNewApiAccountKeyResources = (siteType: AccountSiteType) => {
  const variant = resolveNewApiKeyVariant(siteType)
  return defineAccountKeyResourceCapability({
    siteType,
    inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Recoverable,
    defaultCreation: variant.defaultCreation,
    openConfig: async (input) => ({
      account: input.account,
      request: input.request,
      transport: variant.transport,
      variant,
    }),
    listScopes: async (config): Promise<readonly AccountKeyScope[]> => [
      {
        scopeKey: ACCOUNT_SCOPE_KEY,
        routeKey: ACCOUNT_SCOPE_KEY,
        displayName: config.account.name?.trim() || config.request.baseUrl,
        isDefault: true,
      },
    ],
    provisioning: {
      inspect: inspectProvisioning,
      provision: provisionRequirement,
      rename: renameProvisionedResource,
    },
    runtimeKey: { resolve: resolveRuntimeKey },
    defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
    encodeLocator: encodeTokenId,
    decodeLocator: decodeTokenId,
    locatorFromListItem: (item: NewApiToken) => requireTokenId(item.id),
    locatorFromDetail: (detail: NewApiToken) => requireTokenId(detail.id),
    list: async (
      config,
      _scope,
      _query,
      options,
    ): Promise<AccountKeyResourcePage<NewApiToken>> => {
      const items = await collectValidatedInventoryTokens(config, options)
      return { items, total: items.length }
    },
    get: async (config, _scope, tokenId, options) => {
      const token = (
        await collectValidatedInventoryTokens(config, options)
      ).find((candidate) => candidate.id === tokenId)
      if (!token) throw new Error("token_not_found")
      return readEditableToken(config, token, options)
    },
    toListFacts: toFacts,
    toDetailFacts: toFacts,
    createEditor: async (config, _scope, _options, _inventory, intent) =>
      createNewApiKeyEditor(config.variant, config.request, undefined, intent),
    editEditor: (config, _scope, detail) =>
      createNewApiKeyEditor(config.variant, config.request, detail),
    create: createNewApiAccountToken,
    update: updateNewApiAccountToken,
    delete: deleteNewApiAccountToken,
    mapFailure,
  })
}
