import {
  INVENTORY_GROUP_KINDS,
  resolveNamedInventoryGroup,
  type KeyManagementCapability,
} from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchAllAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/sub2api"

export const sub2ApiKeyManagement: KeyManagementCapability = {
  fetchTokens: (request, options) =>
    fetchAccountTokens(request, options?.page, options?.size),
  fetchAllTokens: (request) => fetchAllAccountTokens(request),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  updateToken: ({ request, tokenId, tokenData }) =>
    updateApiToken(request, tokenId, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteApiToken(request, tokenId),
  fetchAvailableModels: (request) => fetchAccountAvailableModels(request),
  // Sub2API persists a nullable group_id; a missing relation is an ungrouped
  // key, while an id without its joined name is incomplete inventory data.
  // https://github.com/Wei-Shaw/sub2api/blob/8b3fe664dc68d056a65942b7b309089d65dfb8f7/backend/ent/schema/api_key.go#L40-L46
  inventoryGroup: {
    resolve: (token) => {
      const named = resolveNamedInventoryGroup(
        token,
        INVENTORY_GROUP_KINDS.Ungrouped,
      )

      if (
        named.kind === INVENTORY_GROUP_KINDS.Ungrouped &&
        token.sub2api_group_id !== undefined &&
        token.sub2api_group_id !== null
      ) {
        return { kind: INVENTORY_GROUP_KINDS.Unavailable }
      }

      return named
    },
  },
  userGroups: {
    fetch: (request) => fetchUserGroups(request),
  },
}
