import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  fetchAccountTokens,
  resolveApiTokenKey,
} from "~/services/apiService/aihubmix"

export const aihubmixKeyManagement: KeyManagementCapability = {
  fetchTokens: (request) => fetchAccountTokens(request),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
}
