import { SITE_TYPES } from "~/constants/siteType"
import {
  VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  VeloeraChannelStatus,
  VeloeraChannelType,
  VeloeraChannelTypeNames,
  VeloeraChannelTypeOptions,
} from "~/constants/veloera"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
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
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { buildChannelPayload } from "~/services/managedSites/providers/veloera"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import { userPreferences } from "~/services/preferences/userPreferences"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import type { NewApiFamilyChannelCommand } from "~/types/newApiFamilyChannelEditor"
import type {
  VeloeraChannel,
  VeloeraUpdateChannelPayload,
} from "~/types/veloera"
import type { VeloeraConfig } from "~/types/veloeraConfig"
import { normalizeList } from "~/utils/core/string"

import {
  veloeraChannelOperations,
  veloeraManagedResourceModels,
} from "./veloeraOperations"

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
  ): Promise<{ items: VeloeraChannel[]; total: number }>
  get(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<VeloeraChannel>
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string>
  create(
    draft: NewApiFamilyChannelCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<VeloeraChannel>>
  update(
    detail: VeloeraChannel,
    command: NewApiFamilyChannelCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<VeloeraChannel>>
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

const channels = veloeraChannelOperations
const queries = veloeraManagedSiteCapabilities.queries
const veloeraEditor = createNewApiFamilyEditorBindings({
  fields: VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  defaultType: VeloeraChannelType.OpenAI,
  status: VeloeraChannelStatus,
  typeNames: VeloeraChannelTypeNames,
  typeOptions: VeloeraChannelTypeOptions,
  unsupportedCreateTypes: new Set([VeloeraChannelType.VertexAi]),
  baseUrlRequiredTypes: new Set(),
  // Veloera's update model stores group as a non-pointer string, so GORM
  // silently ignores an attempted empty value. Reject clearing an existing
  // group while keeping legacy channels that are already empty editable.
  // https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/model/channel.go
  groupsRequired: true,
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
  statusCodes: VeloeraChannelStatus,
  emptyInventorySecretState: "masked",
})

const listChannels = async (
  nativeConfig: VeloeraNativeConfig,
  query?: ResourceListQuery,
  options?: ResourceOperationOptions,
) => {
  throwIfNewApiResourceOperationAborted(options)
  const result = await channels.list(nativeConfig.config, options)
  throwIfNewApiResourceOperationAborted(options)
  const search = query?.search?.trim().toLocaleLowerCase()
  if (!search) return result
  const items = result.items.filter((channel) =>
    veloeraResourceFacts
      .getSearchData(channel)
      .searchValues.some((value) => value.toLocaleLowerCase().includes(search)),
  )
  return { items, total: items.length }
}

const listCompleteChannelInventory = async (
  nativeConfig: VeloeraNativeConfig,
  options?: ResourceOperationOptions,
) => {
  return await channels.list(nativeConfig.config, {
    ...options,
    requireCompleteInventory: true,
  })
}

const createChannel = async (
  nativeConfig: VeloeraNativeConfig,
  draft: NewApiFamilyChannelCommand,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<VeloeraChannel>> =>
  await attributeCreatedNativeResource({
    attributionKey: `${SITE_TYPES.VELOERA}:${nativeConfig.scopeKey}`,
    listInventory: async () =>
      (await listCompleteChannelInventory(nativeConfig, options)).items,
    create: async () =>
      await channels.create(
        nativeConfig.config,
        buildChannelPayload(draft),
        options,
      ),
    identity: (item) => item.id,
  })

const toUpdatePayload = (
  detail: VeloeraChannel,
  draft: NewApiFamilyChannelCommand,
): VeloeraUpdateChannelPayload => {
  const editable = {
    name: draft.name.trim(),
    type: draft.type,
    base_url: draft.base_url.trim(),
    models: normalizeList(draft.models).join(","),
    group: normalizeList(draft.groups).join(","),
    priority: draft.priority,
    weight: draft.weight,
    status: draft.status,
  }
  const payload: VeloeraUpdateChannelPayload = { id: detail.id }
  // Veloera uses GORM's selective Updates, then reloads the saved channel
  // before updating abilities. Its base URL, priority, and weight fields are
  // pointers, so explicit empty and zero values remain present during updates.
  // Unedited provider fields need not be replayed.
  // https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/model/channel.go
  for (const field of Object.keys(editable) as (keyof typeof editable)[]) {
    if (editable[field] !== detail[field]) {
      Object.assign(payload, { [field]: editable[field] })
    }
  }
  // The controller validates Vertex's region when the type is submitted.
  // https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/channel.go
  if (payload.type === VeloeraChannelType.VertexAi) {
    payload.other = detail.other
  }
  if (hasUsableManagedSiteChannelKey(draft.key)) {
    payload.key = draft.key.trim()
  }
  return payload
}

const applyUpdate = (
  detail: VeloeraChannel,
  payload: VeloeraUpdateChannelPayload,
) =>
  ({
    ...detail,
    ...payload,
    key: payload.key ?? detail.key,
  }) as VeloeraChannel

const updateChannel = async (
  nativeConfig: VeloeraNativeConfig,
  detail: VeloeraChannel,
  draft: NewApiFamilyChannelCommand,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<VeloeraChannel>> => {
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
    canLoadSecret: true,
    list: (query, options) => listChannels(nativeConfig, query, options),
    get: async (locator, options) => {
      throwIfNewApiResourceOperationAborted(options)
      return await channels.get(nativeConfig.config, locator, options)
    },
    loadSecret: async (locator, options) => {
      throwIfNewApiResourceOperationAborted(options)
      return (await channels.get(nativeConfig.config, locator, options)).key
    },
    create: (draft, options) => createChannel(nativeConfig, draft, options),
    update: (detail, draft, options) =>
      updateChannel(nativeConfig, detail, draft, options),
    delete: (locator, options) =>
      channels.delete(nativeConfig.config, locator, options),
    fetchModels: async (locator, options) => {
      return await veloeraManagedResourceModels.fetchModels(
        nativeConfig.config,
        createManagedChannelResourceRef(
          SITE_TYPES.VELOERA,
          nativeConfig.config.baseUrl,
          locator,
        ),
        options,
      )
    },
    fetchDraftModels: async (probe, options) => {
      return await veloeraManagedResourceModels.fetchDraftModels(
        nativeConfig.config,
        probe,
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
  createSeedBindings: [veloeraEditor.importSeedBinding],
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
  locatorFromListItem: (item: VeloeraChannel) => item.id,
  locatorFromDetail: (detail: VeloeraChannel) => detail.id,
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
  toListFacts: (channel: VeloeraChannel, ref: ManagedResourceRef) =>
    veloeraResourceFacts.toFacts(channel, ref, { inventory: true }),
  toDetailFacts: (channel: VeloeraChannel, ref: ManagedResourceRef) =>
    veloeraResourceFacts.toFacts(channel, ref, { inventory: false }),
  createEditor: veloeraEditor.createEditor,
  editEditor: veloeraEditor.editEditor,
  sanitizeEditDetail: veloeraEditor.sanitizeEditDetail,
  create: (
    operations: VeloeraNativeResourceOperations,
    draft: NewApiFamilyChannelCommand,
    options?: ResourceOperationOptions,
  ) => operations.create(draft, options),
  update: (
    operations: VeloeraNativeResourceOperations,
    detail: VeloeraChannel,
    draft: NewApiFamilyChannelCommand,
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
