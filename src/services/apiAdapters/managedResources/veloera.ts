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
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  ManagedResourceError,
  type ManagedResourceRef,
  type ResourceDisplayFacts,
  type ResourceFailure,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteChannelModelProbe } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import { createNewApiFamilyEditorBindings } from "~/services/apiAdapters/managedResources/newApiEditor"
import {
  parseNewApiResourceList,
  throwIfNewApiResourceOperationAborted,
} from "~/services/apiAdapters/managedResources/newApiResourceUtils"
import { veloeraManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/veloera"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
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
const createAttributionTailsByScope = new Map<string, Promise<void>>()

const withSerializedCreateAttribution = async <T>(
  scopeKey: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const previous = createAttributionTailsByScope.get(scopeKey)
  const current = (previous ?? Promise.resolve()).then(operation, operation)
  const tail = current.then(
    () => undefined,
    () => undefined,
  )
  createAttributionTailsByScope.set(scopeKey, tail)
  try {
    return await current
  } finally {
    if (createAttributionTailsByScope.get(scopeKey) === tail) {
      createAttributionTailsByScope.delete(scopeKey)
    }
  }
}

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

const channelTypeLabel = (channel: VeloeraManagedSiteChannel) =>
  VeloeraChannelTypeNames[
    Number(channel.type) as keyof typeof VeloeraChannelTypeNames
  ] ?? String(channel.type)

const channelSearchValues = (channel: VeloeraManagedSiteChannel) => [
  channelTypeLabel(channel),
  channel.base_url ?? "",
  ...parseNewApiResourceList(channel.models),
  ...parseNewApiResourceList(channel.group),
]

const toVeloeraResourceFacts = (
  channel: VeloeraManagedSiteChannel,
  ref: ManagedResourceRef,
  options: { inventory: boolean },
): ResourceDisplayFacts => {
  const fields = VELOERA_MANAGED_RESOURCE_FIELD_IDS
  const models = parseNewApiResourceList(channel.models)
  const groups = parseNewApiResourceList(channel.group)
  const typeLabel = channelTypeLabel(channel)
  const status =
    channel.status === 1
      ? MANAGED_RESOURCE_STATUSES.Enabled
      : channel.status === 2
        ? MANAGED_RESOURCE_STATUSES.ManuallyDisabled
        : channel.status === 3
          ? MANAGED_RESOURCE_STATUSES.AutoDisabled
          : MANAGED_RESOURCE_STATUSES.Unknown
  const secretState = hasUsableManagedSiteChannelKey(channel.key)
    ? MANAGED_RESOURCE_SECRET_STATES.Available
    : options.inventory
      ? MANAGED_RESOURCE_SECRET_STATES.Masked
      : channel.key?.trim()
        ? MANAGED_RESOURCE_SECRET_STATES.Masked
        : MANAGED_RESOURCE_SECRET_STATES.Unavailable
  return {
    ref,
    displayName: channel.name || `Channel ${channel.id}`,
    status,
    fields: [
      {
        fieldId: fields.Id,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
        value: channel.id,
      },
      {
        fieldId: fields.Name,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
        value: channel.name,
      },
      {
        fieldId: fields.Type,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
        value: typeLabel,
      },
      {
        fieldId: fields.Status,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
        value: status,
      },
      {
        fieldId: fields.BaseUrl,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
        value: channel.base_url ?? "",
      },
      {
        fieldId: fields.Key,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
        state: secretState,
      },
      {
        fieldId: fields.Models,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
        value: models,
      },
      {
        fieldId: fields.ModelCount,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
        value: models.length,
      },
      {
        fieldId: fields.Groups,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
        value: groups,
      },
      {
        fieldId: fields.Priority,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
        value: channel.priority,
      },
      {
        fieldId: fields.Weight,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
        value: channel.weight,
      },
    ],
    searchValues: channelSearchValues(channel),
    actions: {
      canUpdate: true,
      canDelete: true,
      channel: {
        channelId: channel.id,
        channelType: channel.type,
        canSyncModels: true,
        canOpenModelSync: true,
        canConfigureModelFilters: true,
      },
    },
  }
}

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
    [channel.name, ...channelSearchValues(channel)].some((value) =>
      value.toLocaleLowerCase().includes(search),
    ),
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

const withoutUnknownData = (
  result: Exclude<
    ManagedSiteMutationResult<unknown>,
    { outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Succeeded }
  >,
): ManagedSiteMutationResult<VeloeraManagedSiteChannel> => {
  if (result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Partial) return result
  const { data: _data, ...rest } = result
  return rest
}

const unresolvedCreatedIdentity = (
  result: Extract<
    ManagedSiteMutationResult<unknown>,
    { outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Succeeded }
  >,
): ManagedSiteMutationResult<VeloeraManagedSiteChannel> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
  confirmedEffects: result.confirmedEffects as readonly [
    (typeof result.confirmedEffects)[number],
    ...(typeof result.confirmedEffects)[number][],
  ],
  completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
  diagnostic: {
    code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    message: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
  },
})

const createChannel = async (
  nativeConfig: VeloeraNativeConfig,
  draft: ChannelFormData,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<VeloeraManagedSiteChannel>> =>
  await withSerializedCreateAttribution(nativeConfig.scopeKey, async () => {
    const before = await listCompleteChannelInventory(nativeConfig, options)
    const existingIds = new Set(before.items.map((item) => item.id))
    const result = await channels.create(
      nativeConfig.config,
      veloeraManagedSiteCapabilities.channelDrafts.buildPayload(draft),
      options,
    )
    if (result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
      return withoutUnknownData(result)
    }
    try {
      // Veloera confirms creation without returning the new channel identity:
      // https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/channel.go
      const after = await listCompleteChannelInventory(nativeConfig, options)
      const created = after.items.filter((item) => !existingIds.has(item.id))
      return created.length === 1
        ? { ...result, data: created[0] }
        : unresolvedCreatedIdentity(result)
    } catch {
      return unresolvedCreatedIdentity(result)
    }
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
    toVeloeraResourceFacts(channel, ref, { inventory: true }),
  toDetailFacts: (
    channel: VeloeraManagedSiteChannel,
    ref: ManagedResourceRef,
  ) => toVeloeraResourceFacts(channel, ref, { inventory: false }),
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
