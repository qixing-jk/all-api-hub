import {
  DONE_HUB_MANAGED_RESOURCE_FIELD_IDS,
  DoneHubChannelType,
  DoneHubChannelTypeNames,
  DoneHubChannelTypeOptions,
} from "~/constants/doneHub"
import { SITE_TYPES } from "~/constants/siteType"
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
import {
  parseNewApiResourceList,
  throwIfNewApiResourceOperationAborted,
} from "~/services/apiAdapters/managedResources/newApiResourceUtils"
import { doneHubManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/doneHub"
import { toManagedSiteApiServiceRequest } from "~/services/apiAdapters/managedSites/request"
import {
  fetchChannelRaw,
  normalizeDoneHubChannel,
  type DoneHubChannelRaw,
} from "~/services/apiService/doneHub"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { DoneHubConfig } from "~/types/doneHubConfig"
import type {
  ChannelFormData,
  ManagedSiteChannel,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import { normalizeList } from "~/utils/core/string"

type DoneHubNativeConfig = {
  config: DoneHubConfig
  scopeKey: string
}

type DoneHubNativeDetail = DoneHubChannelRaw & { id: number }

type DoneHubNativeResourceOperations = {
  scopeKey: string
  canLoadSecret: boolean
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<{ items: ManagedSiteChannel[]; total: number }>
  get(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<DoneHubNativeDetail>
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string>
  create(
    draft: ChannelFormData,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<DoneHubNativeDetail>>
  update(
    detail: DoneHubNativeDetail,
    command: ChannelFormData,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<DoneHubNativeDetail>>
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

const channels = doneHubManagedSiteCapabilities.channels
const queries = doneHubManagedSiteCapabilities.queries
const doneHubEditor = createNewApiFamilyEditorBindings({
  fields: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS,
  typeNames: DoneHubChannelTypeNames,
  typeOptions: DoneHubChannelTypeOptions,
  unsupportedCreateTypes: new Set([
    DoneHubChannelType.AzureOpenAI,
    DoneHubChannelType.AzureSpeech,
    DoneHubChannelType.Gemini,
    DoneHubChannelType.Xunfei,
    DoneHubChannelType.VertexAI,
    DoneHubChannelType.GeminiCli,
    DoneHubChannelType.VertexAIExpress,
  ]),
  baseUrlRequiredTypes: new Set([
    DoneHubChannelType.Custom,
    DoneHubChannelType.Midjourney,
    DoneHubChannelType.Ollama,
    DoneHubChannelType.Suno,
    DoneHubChannelType.AzureDatabricks,
  ]),
})
const doneHubResourceFacts = createNewApiFamilyResourceFacts({
  fields: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS,
  typeNames: DoneHubChannelTypeNames,
  emptyInventorySecretState: "masked",
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

const openConfig = async (): Promise<DoneHubNativeConfig> => {
  const preferences = await userPreferences.getPreferences()
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.DONE_HUB,
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

const listChannels = async (
  nativeConfig: DoneHubNativeConfig,
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
    doneHubResourceFacts
      .getSearchData(channel)
      .searchValues.some((value) => value.toLocaleLowerCase().includes(search)),
  )
  return { items, total: items.length }
}

const listCompleteChannelInventory = async (
  nativeConfig: DoneHubNativeConfig,
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

const getChannel = async (
  nativeConfig: DoneHubNativeConfig,
  locator: number,
  options?: ResourceOperationOptions,
): Promise<DoneHubNativeDetail> => {
  throwIfNewApiResourceOperationAborted(options)
  const raw = await fetchChannelRaw(
    toManagedSiteApiServiceRequest(nativeConfig.config, options),
    locator,
    options,
  )
  throwIfNewApiResourceOperationAborted(options)
  const normalized = normalizeDoneHubChannel(raw)
  if (!Number.isSafeInteger(normalized.id) || normalized.id <= 0) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    })
  }
  return { ...raw, id: normalized.id }
}

const loadChannelSecret = async (
  nativeConfig: DoneHubNativeConfig,
  locator: number,
  options?: ResourceOperationOptions,
) => {
  const secret = (await getChannel(nativeConfig, locator, options)).key ?? ""
  if (!hasUsableManagedSiteChannelKey(secret)) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    })
  }
  return secret.trim()
}

const createChannel = async (
  nativeConfig: DoneHubNativeConfig,
  draft: ChannelFormData,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<DoneHubNativeDetail>> =>
  await attributeCreatedNativeResource({
    attributionKey: `${SITE_TYPES.DONE_HUB}:${nativeConfig.scopeKey}`,
    listInventory: async () =>
      (await listCompleteChannelInventory(nativeConfig, options)).items.map(
        (item) => ({ ...item }) as DoneHubNativeDetail,
      ),
    create: async () =>
      await channels.create(
        nativeConfig.config,
        doneHubManagedSiteCapabilities.channelDrafts.buildPayload(draft),
        options,
      ),
    identity: (item) => item.id,
  })

const sameList = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const planDoneHubUpdate = (
  detail: DoneHubNativeDetail,
  draft: ChannelFormData,
): UpdateChannelPayload & Record<string, unknown> => {
  const current = normalizeDoneHubChannel(detail)
  const models = normalizeList(draft.models)
  const groups = normalizeList(draft.groups)
  const currentModels = parseNewApiResourceList(current.models)
  const currentGroups = parseNewApiResourceList(current.group)
  const partial: UpdateChannelPayload & Record<string, unknown> = {
    id: current.id,
  }
  let requiresFullUpdate = false

  const addSelectiveString = (
    field: "name" | "base_url" | "group",
    value: string,
    previous: string,
  ) => {
    if (value === previous) return
    if (!value) {
      requiresFullUpdate = true
      return
    }
    partial[field] = value as never
  }
  const addSelectiveNumber = (
    field: "type" | "priority" | "weight" | "status",
    value: number,
    previous: number,
  ) => {
    if (value === previous) return
    if (value === 0) {
      requiresFullUpdate = true
      return
    }
    partial[field] = value as never
  }

  addSelectiveString("name", draft.name.trim(), current.name.trim())
  addSelectiveNumber("type", Number(draft.type), Number(current.type))
  if (
    "type" in partial &&
    typeof detail.tag === "string" &&
    detail.tag !== ""
  ) {
    // DoneHub validates type changes against the channel's current tag before
    // its selective GORM update; omitting the tag would bypass that invariant.
    // https://github.com/deanxv/done-hub/blob/1c09e7d75dc170a53d47af1e88c498816a5b85fb/controller/channel.go#L164-L190
    partial.tag = detail.tag
  }
  addSelectiveString(
    "base_url",
    draft.base_url.trim(),
    (current.base_url ?? "").trim(),
  )
  addSelectiveString("group", groups.join(","), currentGroups.join(","))
  addSelectiveNumber("priority", draft.priority, current.priority)
  addSelectiveNumber("weight", draft.weight, current.weight)
  addSelectiveNumber("status", draft.status, current.status)
  if (!sameList(models, currentModels)) requiresFullUpdate = true
  if (hasUsableManagedSiteChannelKey(draft.key)) {
    partial.key = draft.key.trim()
  }

  if (!requiresFullUpdate) return partial

  const key = hasUsableManagedSiteChannelKey(draft.key)
    ? draft.key.trim()
    : current.key
  if (!hasUsableManagedSiteChannelKey(key)) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    })
  }

  // DoneHub switches to Select("*") whenever `models` is non-empty. Full
  // writes therefore start from a just-refetched native object, not the editor
  // snapshot, and preserve provider fields unknown to this extension.
  // https://github.com/deanxv/done-hub/blob/1c09e7d75dc170a53d47af1e88c498816a5b85fb/controller/channel.go
  return {
    ...detail,
    id: current.id,
    name: draft.name.trim(),
    type: Number(draft.type),
    key: key.trim(),
    base_url: draft.base_url.trim(),
    models: models.join(","),
    group: groups.join(","),
    priority: draft.priority,
    weight: draft.weight,
    status: draft.status,
  }
}

const updateChannel = async (
  nativeConfig: DoneHubNativeConfig,
  detail: DoneHubNativeDetail,
  draft: ChannelFormData,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<DoneHubNativeDetail>> => {
  const payload = planDoneHubUpdate(detail, draft)
  const result = await channels.update(nativeConfig.config, payload, options)
  if (
    result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded ||
    result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial
  ) {
    return {
      ...result,
      data: {
        ...detail,
        ...payload,
        id: normalizeDoneHubChannel(detail).id,
        key: payload.key ?? detail.key,
      } as DoneHubNativeDetail,
    }
  }
  return result
}

/** Opens DoneHub-native channel operations used by the UI and migration. */
export async function openDoneHubNativeResourceOperations(): Promise<DoneHubNativeResourceOperations> {
  const nativeConfig = await openConfig()
  return {
    scopeKey: nativeConfig.scopeKey,
    canLoadSecret: true,
    list: (query, options) => listChannels(nativeConfig, query, options),
    get: (locator, options) => getChannel(nativeConfig, locator, options),
    loadSecret: (locator, options) =>
      loadChannelSecret(nativeConfig, locator, options),
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

const doneHubNativeDefinition = {
  siteType: SITE_TYPES.DONE_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: doneHubEditor.projectImportSeed,
    },
  ],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig: openDoneHubNativeResourceOperations,
  scopeKey: (operations: DoneHubNativeResourceOperations) =>
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
  locatorFromListItem: (item: ManagedSiteChannel) => item.id,
  locatorFromDetail: (detail: DoneHubNativeDetail) => detail.id,
  list: (
    operations: DoneHubNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => operations.list(query, options),
  get: (
    operations: DoneHubNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.get(locator, options),
  toListFacts: (channel: ManagedSiteChannel, ref: ManagedResourceRef) =>
    doneHubResourceFacts.toFacts(channel, ref, { inventory: true }),
  toDetailFacts: (detail: DoneHubNativeDetail, ref: ManagedResourceRef) =>
    doneHubResourceFacts.toFacts(normalizeDoneHubChannel(detail), ref, {
      inventory: false,
    }),
  createEditor: doneHubEditor.createEditor,
  editEditor: (
    operations: DoneHubNativeResourceOperations,
    detail: DoneHubNativeDetail,
    options?: ResourceOperationOptions,
  ) =>
    doneHubEditor.editEditor(
      operations,
      normalizeDoneHubChannel(detail),
      options,
    ),
  sanitizeEditDetail: (detail: DoneHubNativeDetail) =>
    doneHubEditor.sanitizeEditDetail(
      normalizeDoneHubChannel(detail),
    ) as DoneHubNativeDetail,
  create: (
    operations: DoneHubNativeResourceOperations,
    draft: ChannelFormData,
    options?: ResourceOperationOptions,
  ) => operations.create(draft, options),
  update: (
    operations: DoneHubNativeResourceOperations,
    detail: DoneHubNativeDetail,
    draft: ChannelFormData,
    options?: ResourceOperationOptions,
  ) => operations.update(detail, draft, options),
  delete: (
    operations: DoneHubNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.delete(locator, options),
  mapFailure,
}

export const doneHubManagedResourceRegistration = defineNativeResourceKind(
  doneHubNativeDefinition,
)
