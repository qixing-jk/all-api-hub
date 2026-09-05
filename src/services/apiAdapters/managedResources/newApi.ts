import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS,
  ManagedResourceError,
  type ResourceFailure,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteChannelModelProbe } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { attributeCreatedNativeResource } from "~/services/apiAdapters/managedResources/createAttribution"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import {
  createNewApiCreateEditor,
  createNewApiEditEditor,
  projectNewApiImportSeed,
  sanitizeNewApiEditorDetail,
  toNewApiResourceFacts,
} from "~/services/apiAdapters/managedResources/newApiEditor"
import {
  getNewApiResourceSearchData,
  throwIfNewApiResourceOperationAborted,
} from "~/services/apiAdapters/managedResources/newApiResourceUtils"
import { newApiManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/newApi"
import {
  API_ERROR_CODES,
  ApiError,
  isTempWindowUnsupportedErrorCode,
} from "~/services/apiTransport/errors"
import {
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { buildNewApiUpdatePayload } from "~/services/managedSites/providers/newApiChannelPayload"
import { NewApiChannelKeyRequirementError } from "~/services/managedSites/providers/newApiSession"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { userPreferences } from "~/services/preferences/userPreferences"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type {
  ChannelFormData,
  ManagedSiteChannel,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import type { NewApiConfig } from "~/types/newApiConfig"
import { normalizeList } from "~/utils/core/string"

type NewApiNativeConfig = {
  config: NewApiConfig
  scopeKey: string
}

type NewApiNativeResourceOperations = {
  scopeKey: string
  canLoadSecret: boolean
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): ReturnType<typeof listChannels>
  get(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteChannel>
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string>
  create(
    draft: NewApiCreateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ManagedSiteChannel>>
  update(
    detail: ManagedSiteChannel,
    command: NewApiUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ManagedSiteChannel>>
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

type NewApiCreateCommand = ChannelFormData
type NewApiUpdateCommand = ChannelFormData
const channels = newApiManagedSiteCapabilities.channels
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
  if (!channels.list) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    })
  }
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

const listCompleteChannelInventory = async (
  nativeConfig: NewApiNativeConfig,
  options?: ResourceOperationOptions,
) => {
  throwIfNewApiResourceOperationAborted(options)
  if (!channels.list) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    })
  }
  const result = await channels.list(nativeConfig.config, {
    ...options,
    requireCompleteInventory: true,
  })
  throwIfNewApiResourceOperationAborted(options)
  return result
}

const getChannel = async (
  nativeConfig: NewApiNativeConfig,
  locator: number,
  options?: ResourceOperationOptions,
) => {
  if (!channels.get) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    })
  }
  return await channels.get(nativeConfig.config, locator, options)
}

const createChannel = async (
  nativeConfig: NewApiNativeConfig,
  draft: NewApiCreateCommand,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<ManagedSiteChannel>> =>
  await attributeCreatedNativeResource({
    attributionKey: `${SITE_TYPES.NEW_API}:${nativeConfig.scopeKey}`,
    listInventory: async () =>
      (await listCompleteChannelInventory(nativeConfig, options)).items,
    create: async () =>
      await channels.create(
        nativeConfig.config,
        newApiManagedSiteCapabilities.channelDrafts.buildPayload(draft),
        options,
      ),
    identity: (item) => item.id,
  })

const applyUpdate = (
  detail: ManagedSiteChannel,
  command: UpdateChannelPayload,
  confirmedEffects: readonly { kind: string }[],
) => {
  const statusConfirmed = confirmedEffects.some(
    (effect) =>
      effect.kind === MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
  )
  return {
    ...detail,
    ...command,
    group: command.group ?? detail.group,
    status:
      command.status === undefined || !statusConfirmed
        ? detail.status
        : command.status,
  } as ManagedSiteChannel
}

const updateChannel = async (
  nativeConfig: NewApiNativeConfig,
  detail: ManagedSiteChannel,
  command: NewApiUpdateCommand,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<ManagedSiteChannel>> => {
  const payload = buildNewApiUpdatePayload(detail, command)
  const result = await channels.update(nativeConfig.config, payload, options)
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    return {
      ...result,
      data: applyUpdate(detail, payload, result.confirmedEffects),
    }
  }
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial) {
    const { data: _data, ...rest } = result
    return {
      ...rest,
      data: applyUpdate(detail, payload, result.confirmedEffects),
    }
  }
  return result
}

/** Opens the provider-owned native channel operations used by UI and migration. */
export async function openNewApiNativeResourceOperations(): Promise<NewApiNativeResourceOperations> {
  const nativeConfig = await openConfig()
  const fetchSecretKey = channels.fetchSecretKey
  return {
    scopeKey: nativeConfig.scopeKey,
    canLoadSecret: Boolean(fetchSecretKey),
    list: (query, options) => listChannels(nativeConfig, query, options),
    get: (locator, options) => getChannel(nativeConfig, locator, options),
    loadSecret: async (locator, options) => {
      throwIfNewApiResourceOperationAborted(options)
      if (!fetchSecretKey) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        })
      }
      const secret = await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
        PROTECTION_BYPASS_SURFACES.Options,
        async (protectionBypassExecution) =>
          await fetchSecretKey(nativeConfig.config, locator, {
            protectionBypassExecution,
            signal: options?.signal,
          }),
      )
      throwIfNewApiResourceOperationAborted(options)
      return secret
    },
    create: (draft, options) => createChannel(nativeConfig, draft, options),
    update: (detail, command, options) =>
      updateChannel(nativeConfig, detail, command, options),
    delete: (locator, options) =>
      channels.delete(nativeConfig.config, locator, options),
    fetchModels: async (locator, options) => {
      throwIfNewApiResourceOperationAborted(options)
      if (!channels.fetchModels) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
        })
      }
      return await channels.fetchModels(nativeConfig.config, locator, options)
    },
    fetchDraftModels: async (draft, options) => {
      throwIfNewApiResourceOperationAborted(options)
      if (!channels.fetchDraftModels) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
        })
      }
      return await channels.fetchDraftModels(
        nativeConfig.config,
        draft,
        options,
      )
    },
    loadEditorGroups: async (options) => {
      throwIfNewApiResourceOperationAborted(options)
      try {
        const groups = await queries.fetchSiteUserGroups(
          nativeConfig.config,
          options,
        )
        throwIfNewApiResourceOperationAborted(options)
        return normalizeList(groups)
      } catch {
        throwIfNewApiResourceOperationAborted(options)
        return []
      }
    },
  }
}

const newApiNativeDefinition = {
  siteType: SITE_TYPES.NEW_API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: projectNewApiImportSeed,
    },
  ],
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
  locatorFromListItem: (item: ManagedSiteChannel) => item.id,
  locatorFromDetail: (detail: ManagedSiteChannel) => detail.id,
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
  ) => await createNewApiCreateEditor(operations, options),
  editEditor: createNewApiEditEditor,
  sanitizeEditDetail: sanitizeNewApiEditorDetail,
  create: (
    operations: NewApiNativeResourceOperations,
    draft: NewApiCreateCommand,
    options?: ResourceOperationOptions,
  ) => operations.create(draft, options),
  update: (
    operations: NewApiNativeResourceOperations,
    detail: ManagedSiteChannel,
    command: NewApiUpdateCommand,
    options?: ResourceOperationOptions,
  ) => operations.update(detail, command, options),
  delete: (
    operations: NewApiNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.delete(locator, options),
  mapFailure,
}

export const newApiManagedResourceRegistration = defineNativeResourceKind(
  newApiNativeDefinition,
)
