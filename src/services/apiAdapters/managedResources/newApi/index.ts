import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS,
  ManagedResourceError,
  type ResourceFailure,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteChannelModelProbe } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import { withNewApiAdvancedEditor } from "~/services/apiAdapters/managedResources/newApi/advancedEditor"
import {
  createNewApiCreateEditor,
  createNewApiEditEditor,
  newApiImportSeedBinding,
  sanitizeNewApiEditorDetail,
  toNewApiResourceFacts,
} from "~/services/apiAdapters/managedResources/newApi/editor"
import { withNewApiMultiKeyEditor } from "~/services/apiAdapters/managedResources/newApi/multiKeyEditor"
import type { NewApiNativeConfig } from "~/services/apiAdapters/managedResources/newApi/nativeConfig"
import {
  createChannel,
  updateChannel,
} from "~/services/apiAdapters/managedResources/newApi/nativeMutation"
import {
  newApiChannelOperations,
  newApiManagedResourceModels,
} from "~/services/apiAdapters/managedResources/newApi/operations"
import {
  getNewApiResourceSearchData,
  throwIfNewApiResourceOperationAborted,
} from "~/services/apiAdapters/managedResources/newApi/resourceUtils"
import { rethrowNewApiFamilyChannelReadError } from "~/services/apiAdapters/managedResources/newApiFamily/channelErrors"
import { newApiManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/newApi"
import {
  API_ERROR_CODES,
  ApiError,
  isTempWindowUnsupportedErrorCode,
} from "~/services/apiTransport/errors"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/configuration/runtimeConfig"
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import { type ManagedSiteMutationResult } from "~/services/managedSites/mutations/contracts"
import { NewApiChannelKeyRequirementError } from "~/services/managedSites/providers/newApi/newApiSessionContracts"
import { userPreferences } from "~/services/preferences/userPreferences"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import type { NewApiChannel } from "~/types/newApi"
import type { NewApiChannelCommand } from "~/types/newApiChannelEditor"
import { normalizeList } from "~/utils/core/string"

type NewApiNativeResourceOperations = {
  deleteKey(
    locator: number,
    keyIndex: number,
    options?: ResourceOperationOptions,
  ): ReturnType<typeof channels.deleteKey>
  scopeKey: string
  canLoadSecret: boolean
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): ReturnType<typeof listChannels>
  get(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<NewApiChannel>
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string>
  create(
    draft: NewApiChannelCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<NewApiChannel>>
  update(
    detail: NewApiChannel,
    command: NewApiChannelCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<NewApiChannel>>
  delete(
    locator: number,
    options?: ResourceOperationOptions,
  ): ReturnType<typeof channels.delete>
  fetchModels(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string[]>
  fetchDraftModels(
    probe: ManagedSiteChannelModelProbe,
    options?: ResourceOperationOptions,
  ): Promise<string[]>
  loadEditorGroups(
    options?: ResourceOperationOptions,
  ): Promise<readonly string[]>
}

const channels = newApiChannelOperations
const queries = newApiManagedSiteCapabilities.queries
const mapApiErrorFailureCode = (error: ApiError): ResourceFailure["code"] => {
  if (isTempWindowUnsupportedErrorCode(error.code)) {
    return MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
  }
  if (error.statusCode === 401 || error.code === API_ERROR_CODES.HTTP_401) {
    return MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
  }
  if (error.statusCode === 403 || error.code === API_ERROR_CODES.HTTP_403) {
    return MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
  }
  if (error.statusCode === 404) {
    return MANAGED_RESOURCE_FAILURE_CODES.NotFound
  }
  if (error.code === API_ERROR_CODES.NETWORK_ERROR) {
    return MANAGED_RESOURCE_FAILURE_CODES.Unavailable
  }
  return MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
}

const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof NewApiChannelKeyRequirementError) {
    return {
      code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
      recoveryHint:
        MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS.InteractiveVerification,
      ...(error.channelId
        ? { recoveryResourceId: String(error.channelId) }
        : {}),
    }
  }
  if (error instanceof ApiError) {
    return {
      code: mapApiErrorFailureCode(error),
      message: error.message,
      ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
    }
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

const openConfig = async (): Promise<NewApiNativeConfig> => {
  const preferences = await userPreferences.getPreferences()
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.NEW_API,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }
  let scopeKey: string
  try {
    const url = new URL(resolved.config.baseUrl.trim())
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error("invalid origin")
    }
    scopeKey = normalizeManagedUpstreamResourceScopeKey(url.origin)
  } catch {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    })
  }
  return { config: resolved.config, scopeKey }
}

const listChannels = async (
  nativeConfig: NewApiNativeConfig,
  query?: ResourceListQuery,
  options?: ResourceOperationOptions,
) => {
  throwIfNewApiResourceOperationAborted(options)
  const search = query?.search?.trim()
  const result = await channels.list(nativeConfig.config, options)
  throwIfNewApiResourceOperationAborted(options)
  if (!search) return result

  // Upstream `/api/channel/search` is separately paginated and its keyword
  // contract is narrower than this product's display-safe search facts:
  // https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go
  const normalizedSearch = search.toLocaleLowerCase()
  const items = result.items.filter((channel) =>
    [channel.name, ...getNewApiResourceSearchData(channel).searchValues].some(
      (value) => value.toLocaleLowerCase().includes(normalizedSearch),
    ),
  )
  return { items, total: items.length }
}

const getChannel = async (
  nativeConfig: NewApiNativeConfig,
  locator: number,
  options?: ResourceOperationOptions,
) => {
  return await channels
    .get(nativeConfig.config, locator, options)
    .catch(rethrowNewApiFamilyChannelReadError)
}

/** Opens native resource commands under the current managed-site configuration. */
export async function openNewApiNativeResourceOperations(): Promise<NewApiNativeResourceOperations> {
  const nativeConfig = await openConfig()
  return {
    scopeKey: nativeConfig.scopeKey,
    deleteKey: (locator, keyIndex, options) =>
      channels.deleteKey(nativeConfig.config, locator, keyIndex, options),
    canLoadSecret: true,
    list: (query, options) => listChannels(nativeConfig, query, options),
    get: (locator, options) => getChannel(nativeConfig, locator, options),
    loadSecret: (locator, options) =>
      loadNativeSecret(nativeConfig, locator, options),
    create: (draft, options) => createChannel(nativeConfig, draft, options),
    update: (detail, command, options) =>
      updateChannel(nativeConfig, detail, command, options),
    delete: (locator, options) =>
      channels.delete(nativeConfig.config, locator, options),
    fetchModels: async (locator, options) => {
      throwIfNewApiResourceOperationAborted(options)
      return await newApiManagedResourceModels.fetchModels(
        nativeConfig.config,
        createManagedChannelResourceRef(
          SITE_TYPES.NEW_API,
          nativeConfig.config.baseUrl,
          locator,
        ),
        options,
      )
    },
    fetchDraftModels: async (draft, options) => {
      throwIfNewApiResourceOperationAborted(options)
      return await newApiManagedResourceModels.fetchDraftModels(
        nativeConfig.config,
        draft,
        options,
      )
    },
    loadEditorGroups: async (options) => {
      throwIfNewApiResourceOperationAborted(options)
      const fetchSiteUserGroups = queries.siteUserGroups?.fetch
      if (!fetchSiteUserGroups) return []
      try {
        const groups = await fetchSiteUserGroups(nativeConfig.config, options)
        throwIfNewApiResourceOperationAborted(options)
        return normalizeList(groups)
      } catch (error) {
        throwIfNewApiResourceOperationAborted(options)
        throw error
      }
    },
  }
}

const newApiNativeDefinition = {
  siteType: SITE_TYPES.NEW_API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [newApiImportSeedBinding],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig: openNewApiNativeResourceOperations,
  scopeKey: (operations: NewApiNativeResourceOperations) => operations.scopeKey,
  encodeLocator: (locator: number) => String(locator),
  decodeLocator: (resourceId: string) => {
    const locator = Number(resourceId)
    if (!Number.isSafeInteger(locator) || locator <= 0) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return locator
  },
  locatorFromListItem: (item: NewApiChannel) => item.id,
  locatorFromDetail: (detail: NewApiChannel) => detail.id,
  list: async (
    operations: NewApiNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => {
    const result = await operations.list(query, options)
    return { items: result.items, total: result.total }
  },
  get: (
    operations: NewApiNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.get(locator, options),
  toListFacts: toNewApiResourceFacts,
  toDetailFacts: toNewApiResourceFacts,
  createEditor: async (
    operations: NewApiNativeResourceOperations,
    options?: ResourceOperationOptions,
  ) =>
    withNewApiMultiKeyEditor(
      withNewApiAdvancedEditor(
        await createNewApiCreateEditor(operations, options),
      ),
    ),
  editEditor: async (
    operations: NewApiNativeResourceOperations,
    detail: NewApiChannel,
    options?: ResourceOperationOptions,
  ) =>
    withNewApiMultiKeyEditor(
      withNewApiAdvancedEditor(
        await createNewApiEditEditor(operations, detail, options),
        detail,
      ),
      detail,
      (loadOptions) => operations.loadSecret(detail.id, loadOptions),
      options,
    ),
  sanitizeEditDetail: sanitizeNewApiEditorDetail,
  create: (
    operations: NewApiNativeResourceOperations,
    draft: NewApiChannelCommand,
    options?: ResourceOperationOptions,
  ) => operations.create(draft, options),
  update: (
    operations: NewApiNativeResourceOperations,
    detail: NewApiChannel,
    command: NewApiChannelCommand,
    options?: ResourceOperationOptions,
  ) => operations.update(detail, command, options),
  delete: (
    operations: NewApiNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.delete(locator, options),
  keyCleanup: async (
    operations: NewApiNativeResourceOperations,
    detail: NewApiChannel,
    options?: ResourceOperationOptions,
  ) => {
    const key = await operations.loadSecret(detail.id, options)
    // GetKeys preserves internal empty entries; filtering them would change native deletion indices.
    // https://github.com/QuantumNous/new-api/blob/main/model/channel.go
    const parseKeys = (value: string) =>
      detail.channel_info?.is_multi_key
        ? value
            .replace(/^\n+|\n+$/g, "")
            .split("\n")
            .map((entry) => entry.trim())
        : [value.trim()]
    const keys = parseKeys(key)
    return {
      baseUrls: [detail.base_url ?? ""],
      keys,
      remove: async (
        indices: readonly number[],
        removeOptions?: ResourceOperationOptions,
      ) => {
        // Descending native indices preserve the location of earlier entries.
        // Re-read before each deletion so a partial/uncertain run is never replayed by index.
        const expected = [...keys]
        let result: Awaited<ReturnType<typeof operations.deleteKey>> | undefined
        for (const index of [...indices].sort((a, b) => b - a)) {
          const current = parseKeys(
            await operations.loadSecret(detail.id, removeOptions),
          )
          if (JSON.stringify(current) !== JSON.stringify(expected))
            throw new ManagedResourceError({ code: "resource_changed" })
          result = await operations.deleteKey(detail.id, index, removeOptions)
          if (result.outcome !== "succeeded") return result
          expected.splice(index, 1)
        }
        if (!result)
          throw new ManagedResourceError({ code: "validation_failed" })
        return result
      },
    }
  },
  mapFailure,
}

export const newApiManagedResourceRegistration = defineNativeResourceKind(
  newApiNativeDefinition,
)

/** Read a channel secret using the configuration captured for this operation. */
async function loadNativeSecret(
  nativeConfig: NewApiNativeConfig,
  locator: number,
  options?: ResourceOperationOptions,
): Promise<string> {
  throwIfNewApiResourceOperationAborted(options)
  const secret = await withProtectionBypassUserCommand(
    PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
    PROTECTION_BYPASS_SURFACES.Options,
    async (protectionBypassExecution) =>
      await channels.fetchSecretKey(nativeConfig.config, locator, {
        protectionBypassExecution,
        signal: options?.signal,
      }),
  )
  throwIfNewApiResourceOperationAborted(options)
  return secret
}
