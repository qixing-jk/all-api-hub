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
import { attributeCreatedNativeResource } from "~/services/apiAdapters/managedResources/createAttribution"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import {
  createNewApiCreateEditor,
  createNewApiEditEditor,
  newApiImportSeedBinding,
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
import { createManagedChannelResourceRef } from "~/services/managedSites/managedResourceIdentity"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { buildChannelPayload } from "~/services/managedSites/providers/newApi"
import {
  buildNewApiAdvancedPayload,
  buildNewApiUpdatePayload,
  hasNewApiAdvancedValues,
} from "~/services/managedSites/providers/newApiChannelPayload"
import { NewApiChannelKeyRequirementError } from "~/services/managedSites/providers/newApiSession"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { userPreferences } from "~/services/preferences/userPreferences"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import type { NewApiChannel, UpdateChannelPayload } from "~/types/newApi"
import type { NewApiChannelCommand } from "~/types/newApiChannelEditor"
import type { NewApiConfig } from "~/types/newApiConfig"
import { normalizeList } from "~/utils/core/string"

import { withNewApiAdvancedEditor } from "./newApiAdvancedEditor"
import {
  newApiChannelOperations,
  newApiManagedResourceModels,
} from "./newApiOperations"

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

const listCompleteChannelInventory = async (
  nativeConfig: NewApiNativeConfig,
  options?: ResourceOperationOptions,
) => {
  throwIfNewApiResourceOperationAborted(options)
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
  return await channels.get(nativeConfig.config, locator, options)
}

const createChannel = async (
  nativeConfig: NewApiNativeConfig,
  draft: NewApiChannelCommand,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<NewApiChannel>> => {
  const basePayload = buildChannelPayload(draft)
  const result = await attributeCreatedNativeResource({
    attributionKey: `${SITE_TYPES.NEW_API}:${nativeConfig.scopeKey}`,
    listInventory: async () =>
      (await listCompleteChannelInventory(nativeConfig, options)).items,
    create: async () =>
      await channels.create(
        nativeConfig.config,
        {
          ...basePayload,
          channel: {
            ...basePayload.channel,
            ...buildNewApiAdvancedPayload({}, draft.advanced),
          },
        },
        options,
      ),
    identity: (item) => item.id,
  })
  return await verifyAdvancedSave(nativeConfig, draft, result, options)
}

const applyUpdate = (
  detail: NewApiChannel,
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
  } as NewApiChannel
}

// Settings and model-detection fields can be ignored by older servers. Reread
// edits before reporting success; never suggest retrying a confirmed creation.
const verifyAdvancedSave = async (
  nativeConfig: NewApiNativeConfig,
  command: NewApiChannelCommand,
  result: ManagedSiteMutationResult<NewApiChannel>,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<NewApiChannel>> => {
  if (
    !command.advanced ||
    result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
  )
    return result
  try {
    const saved = await channels.get(
      nativeConfig.config,
      result.data.id,
      options,
    )
    if (hasNewApiAdvancedValues(saved, command.advanced))
      return { ...result, data: saved }
  } catch {
    /* The write was dispatched; preserve uncertainty and confirmed effects. */
  }
  const diagnostic = {
    code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    message: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
  }
  if (!result.confirmedEffects.length)
    return { outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain, diagnostic }
  return {
    outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
    completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
    confirmedEffects: [
      result.confirmedEffects[0],
      ...result.confirmedEffects.slice(1),
    ],
    diagnostic,
  }
}

const updateChannel = async (
  nativeConfig: NewApiNativeConfig,
  detail: NewApiChannel,
  command: NewApiChannelCommand,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<NewApiChannel>> => {
  const payload = buildNewApiUpdatePayload(detail, command)
  const result = await channels.update(nativeConfig.config, payload, options)
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    return await verifyAdvancedSave(
      nativeConfig,
      command,
      {
        ...result,
        data: applyUpdate(detail, payload, result.confirmedEffects),
      },
      options,
    )
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
    canLoadSecret: true,
    list: (query, options) => listChannels(nativeConfig, query, options),
    get: (locator, options) => getChannel(nativeConfig, locator, options),
    loadSecret: async (locator, options) => {
      throwIfNewApiResourceOperationAborted(options)
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
    withNewApiAdvancedEditor(
      await createNewApiCreateEditor(operations, options),
    ),
  editEditor: async (
    operations: NewApiNativeResourceOperations,
    detail: NewApiChannel,
    options?: ResourceOperationOptions,
  ) =>
    withNewApiAdvancedEditor(
      await createNewApiEditEditor(operations, detail, options),
      detail,
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
  mapFailure,
}

export const newApiManagedResourceRegistration = defineNativeResourceKind(
  newApiNativeDefinition,
)
