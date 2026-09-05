import { SITE_TYPES } from "~/constants/siteType"
import {
  VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  VeloeraChannelType,
  VeloeraChannelTypeNames,
  VeloeraChannelTypeOptions,
} from "~/constants/veloera"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceRef,
  type ResourceFailure,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteChannelModelProbe } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { attributeCreatedNativeResource } from "~/services/apiAdapters/managedResources/createAttribution"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import { createNewApiFamilyEditorBindings } from "~/services/apiAdapters/managedResources/newApiEditor"
import { createNewApiFamilyResourceFacts } from "~/services/apiAdapters/managedResources/newApiFamilyResourceFacts"
import { throwIfNewApiResourceOperationAborted } from "~/services/apiAdapters/managedResources/newApiResourceUtils"
import { veloeraManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/veloera"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { ChannelFormData } from "~/types/managedSite"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import type {
  VeloeraManagedSiteChannel,
  VeloeraUpdateChannelPayload,
} from "~/types/veloera"
import type { VeloeraConfig } from "~/types/veloeraConfig"
import { normalizeList } from "~/utils/core/string"

type VeloeraNativeConfig = {
  config: VeloeraConfig
  scopeKey: string
}

type VeloeraNativeResourceOperations = {
  scopeKey: string
  canLoadSecret: boolean
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<{ items: VeloeraManagedSiteChannel[]; total: number }>
  get(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<VeloeraManagedSiteChannel>
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string>
  create(
    draft: ChannelFormData,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<VeloeraManagedSiteChannel>>
  update(
    detail: VeloeraManagedSiteChannel,
    command: ChannelFormData,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<VeloeraManagedSiteChannel>>
  delete(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
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

const channels = veloeraManagedSiteCapabilities.channels
const queries = veloeraManagedSiteCapabilities.queries
const veloeraEditor = createNewApiFamilyEditorBindings({
  fields: VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  typeNames: VeloeraChannelTypeNames,
  typeOptions: VeloeraChannelTypeOptions,
  unsupportedCreateTypes: new Set([VeloeraChannelType.VertexAi]),
  baseUrlRequiredTypes: new Set(),
})
const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof ApiError) {
    const code =
      error.statusCode === 401 || error.code === API_ERROR_CODES.HTTP_401
        ? MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
        : error.statusCode === 403 || error.code === API_ERROR_CODES.HTTP_403
          ? MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
          : error.statusCode === 404
            ? MANAGED_RESOURCE_FAILURE_CODES.NotFound
            : error.code === API_ERROR_CODES.NETWORK_ERROR
              ? MANAGED_RESOURCE_FAILURE_CODES.Unavailable
              : MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
    return {
      code,
      message: error.message,
      ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
    }
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

const openConfig = async (): Promise<VeloeraNativeConfig> => {
  const preferences = await userPreferences.getPreferences()
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.VELOERA,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }
  try {
    const url = new URL(resolved.config.baseUrl.trim())
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error("invalid origin")
    }
    return {
      config: resolved.config,
      scopeKey: normalizeManagedUpstreamResourceScopeKey(url.origin),
    }
  } catch {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    })
  }
}

const veloeraResourceFacts = createNewApiFamilyResourceFacts({
  fields: VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  typeNames: VeloeraChannelTypeNames,
  emptyInventorySecretState: "masked",
})

const listChannels = async (
  nativeConfig: VeloeraNativeConfig,
  query?: ResourceListQuery,
  options?: ResourceOperationOptions,
) => {
  throwIfNewApiResourceOperationAborted(options)
  if (!channels.list) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    })
  }
  const result = await channels.list(nativeConfig.config, options)
  throwIfNewApiResourceOperationAborted(options)
  const search = query?.search?.trim().toLocaleLowerCase()
  if (!search) return result
  const items = result.items.filter((channel) =>
    [
      channel.name,
      ...veloeraResourceFacts.getSearchData(channel).searchValues,
    ].some((value) => value.toLocaleLowerCase().includes(search)),
  )
  return { items, total: items.length }
}

const listCompleteChannelInventory = async (
  nativeConfig: VeloeraNativeConfig,
  options?: ResourceOperationOptions,
) => {
  if (!channels.list) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
    })
  }
  return await channels.list(nativeConfig.config, {
    ...options,
    requireCompleteInventory: true,
  })
}

const createChannel = async (
  nativeConfig: VeloeraNativeConfig,
  draft: ChannelFormData,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<VeloeraManagedSiteChannel>> =>
  await attributeCreatedNativeResource({
    attributionKey: `${SITE_TYPES.VELOERA}:${nativeConfig.scopeKey}`,
    listInventory: async () =>
      (await listCompleteChannelInventory(nativeConfig, options)).items,
    create: async () =>
      await channels.create(
        nativeConfig.config,
        veloeraManagedSiteCapabilities.channelDrafts.buildPayload(draft),
        options,
      ),
    identity: (item) => item.id,
  })

const toUpdatePayload = (
  detail: VeloeraManagedSiteChannel,
  draft: ChannelFormData,
): VeloeraUpdateChannelPayload => {
  const payload: VeloeraUpdateChannelPayload = {
    ...detail,
    id: detail.id,
    name: draft.name.trim(),
    type: draft.type,
    base_url: draft.base_url.trim(),
    models: normalizeList(draft.models).join(","),
    groups: normalizeList(draft.groups),
    group: normalizeList(draft.groups).join(","),
    priority: draft.priority,
    weight: draft.weight,
    status: draft.status,
  }
  if (hasUsableManagedSiteChannelKey(draft.key)) {
    payload.key = draft.key.trim()
  } else {
    delete payload.key
  }
  return payload
}

const applyUpdate = (
  detail: VeloeraManagedSiteChannel,
  payload: VeloeraUpdateChannelPayload,
) =>
  ({
    ...detail,
    ...payload,
    key: payload.key ?? detail.key,
  }) as VeloeraManagedSiteChannel

const updateChannel = async (
  nativeConfig: VeloeraNativeConfig,
  detail: VeloeraManagedSiteChannel,
  draft: ChannelFormData,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<VeloeraManagedSiteChannel>> => {
  const payload = toUpdatePayload(detail, draft)
  const result = await channels.update(nativeConfig.config, payload, options)
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    return { ...result, data: applyUpdate(detail, payload) }
  }
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial) {
    return { ...result, data: applyUpdate(detail, payload) }
  }
  return result
}

/** Opens the Veloera-native channel operations used by UI and migration. */
export async function openVeloeraNativeResourceOperations(): Promise<VeloeraNativeResourceOperations> {
  const nativeConfig = await openConfig()
  return {
    scopeKey: nativeConfig.scopeKey,
    canLoadSecret: Boolean(channels.get),
    list: (query, options) => listChannels(nativeConfig, query, options),
    get: async (locator, options) => {
      throwIfNewApiResourceOperationAborted(options)
      if (!channels.get) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
        })
      }
      return await channels.get(nativeConfig.config, locator, options)
    },
    loadSecret: async (locator, options) => {
      throwIfNewApiResourceOperationAborted(options)
      if (!channels.get) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        })
      }
      return (await channels.get(nativeConfig.config, locator, options)).key
    },
    create: (draft, options) => createChannel(nativeConfig, draft, options),
    update: (detail, draft, options) =>
      updateChannel(nativeConfig, detail, draft, options),
    delete: (locator, options) =>
      channels.delete(nativeConfig.config, locator, options),
    fetchModels: async (locator, options) => {
      if (!channels.fetchModels) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
        })
      }
      return await channels.fetchModels(nativeConfig.config, locator, options)
    },
    fetchDraftModels: async (probe, options) => {
      if (!channels.fetchDraftModels) {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
        })
      }
      return await channels.fetchDraftModels(
        nativeConfig.config,
        probe,
        options,
      )
    },
    loadEditorGroups: async (options) => {
      try {
        return normalizeList(
          await queries.fetchSiteUserGroups(nativeConfig.config, options),
        )
      } catch {
        throwIfNewApiResourceOperationAborted(options)
        return []
      }
    },
  }
}

const veloeraNativeDefinition = {
  siteType: SITE_TYPES.VELOERA,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: veloeraEditor.projectImportSeed,
    },
  ],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig: openVeloeraNativeResourceOperations,
  scopeKey: (operations: VeloeraNativeResourceOperations) =>
    operations.scopeKey,
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
  locatorFromListItem: (item: VeloeraManagedSiteChannel) => item.id,
  locatorFromDetail: (detail: VeloeraManagedSiteChannel) => detail.id,
  list: (
    operations: VeloeraNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => operations.list(query, options),
  get: (
    operations: VeloeraNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.get(locator, options),
  toListFacts: (channel: VeloeraManagedSiteChannel, ref: ManagedResourceRef) =>
    veloeraResourceFacts.toFacts(channel, ref, { inventory: true }),
  toDetailFacts: (
    channel: VeloeraManagedSiteChannel,
    ref: ManagedResourceRef,
  ) => veloeraResourceFacts.toFacts(channel, ref, { inventory: false }),
  createEditor: veloeraEditor.createEditor,
  editEditor: veloeraEditor.editEditor,
  sanitizeEditDetail: veloeraEditor.sanitizeEditDetail,
  create: (
    operations: VeloeraNativeResourceOperations,
    draft: ChannelFormData,
    options?: ResourceOperationOptions,
  ) => operations.create(draft, options),
  update: (
    operations: VeloeraNativeResourceOperations,
    detail: VeloeraManagedSiteChannel,
    draft: ChannelFormData,
    options?: ResourceOperationOptions,
  ) => operations.update(detail, draft, options),
  delete: (
    operations: VeloeraNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.delete(locator, options),
  mapFailure,
}

export const veloeraManagedResourceRegistration = defineNativeResourceKind(
  veloeraNativeDefinition,
)
