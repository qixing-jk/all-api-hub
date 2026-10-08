import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { openConfig } from "~/services/apiAdapters/managedResources/sub2api/nativeRuntime"
import {
  getSub2ApiApiKeyAccount,
  parseSub2ApiResourceId,
  revealSub2ApiApiKey,
} from "~/services/managedSites/providers/sub2api"

/** Opens native account reads shared with channel migration. */
export async function openSub2ApiNativeResourceOperations(
  options?: ResourceOperationOptions,
) {
  options?.signal?.throwIfAborted()
  const nativeConfig = await openConfig()
  options?.signal?.throwIfAborted()
  return {
    scopeKey: nativeConfig.scopeKey,
    get: async (
      accountId: number,
      operationOptions?: ResourceOperationOptions,
    ) => {
      const id = parseSub2ApiResourceId(accountId)
      const detail = await getSub2ApiApiKeyAccount(nativeConfig.config, id, {
        signal: operationOptions?.signal,
      })
      if (!detail || detail.id !== id) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
        })
      }
      return detail
    },
    loadSecret: (
      accountId: number,
      operationOptions?: ResourceOperationOptions,
    ) =>
      revealSub2ApiApiKey(nativeConfig.config, accountId, {
        signal: operationOptions?.signal,
      }),
  }
}
