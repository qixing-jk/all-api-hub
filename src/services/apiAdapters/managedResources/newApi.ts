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
import { rethrowNewApiFamilyChannelReadError } from "~/services/apiAdapters/managedResources/newApiFamilyChannelErrors"
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

import { resolveCredentialPatch } from "./credentialListEditor"
import { withNewApiAdvancedEditor } from "./newApiAdvancedEditor"
import {
  newApiCredentialRecords,
  newApiKeyMetadata,
  newApiKeyMetadataFingerprint,
  withNewApiMultiKeyEditor,
} from "./newApiMultiKeyEditor"
import {
  newApiChannelOperations,
  newApiManagedResourceModels,
} from "./newApiOperations"

type NewApiNativeConfig = {
  config: NewApiConfig
  scopeKey: string
}

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
  return await channels
    .get(nativeConfig.config, locator, options)
    .catch(rethrowNewApiFamilyChannelReadError)
}

const createChannel = async (
  nativeConfig: NewApiNativeConfig,
  draft: NewApiChannelCommand,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<NewApiChannel>> => {
  if (draft.credentialPatch) {
    const keys = await resolveCredentialPatch(draft.credentialPatch, [])
    draft = { ...draft, key: keys.map(({ key }) => key).join("\n") }
  }
  const basePayload = buildChannelPayload(draft)
  if (draft.credentialPatch && draft.credentialPatch.entries.length > 1) {
    basePayload.mode = "multi_to_single"
    basePayload.multi_key_mode = draft.multiKeyMode ?? "random"
  }
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
    (!command.advanced && !command.credentialPatch && !command.multiKeyMode) ||
    result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Succeeded
  )
    return result
  try {
    const saved = await channels.get(
      nativeConfig.config,
      result.data.id,
      options,
    )
    // Read back non-secret state only. Saving must not implicitly disclose keys.
    const entries = command.credentialPatch?.entries
    const keysMatch =
      !entries ||
      (entries.length === 1 && !saved.channel_info?.is_multi_key) ||
      (saved.channel_info?.multi_key_size === entries.length &&
        entries.every(
          (entry, index) =>
            entry.fields.enabled === undefined ||
            String(
              (saved.channel_info?.multi_key_status_list?.[index] ?? 1) === 1,
            ) === entry.fields.enabled,
        ))
    if (
      keysMatch &&
      (!command.multiKeyMode ||
        (command.credentialPatch?.entries.length === 1 &&
          !saved.channel_info?.is_multi_key) ||
        saved.channel_info?.multi_key_mode === command.multiKeyMode) &&
      (!command.advanced || hasNewApiAdvancedValues(saved, command.advanced))
    )
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
  const keyActions: {
    action: "delete_key" | "enable_key" | "disable_key"
    index: number
  }[] = []
  let keyState: number[] | undefined
  let verificationCommand = command
  if (command.multiKeyMode) payload.multi_key_mode = command.multiKeyMode
  if (command.credentialPatch) {
    if (!detail.channel_info?.is_multi_key)
      throw new ManagedResourceError({ code: "resource_changed" })
    const metadata = newApiKeyMetadata(detail)
    const patch = command.credentialPatch
    if ((await newApiKeyMetadataFingerprint(metadata)) !== patch.baseline)
      throw new ManagedResourceError({ code: "resource_changed" })
    const entries = patch.entries
    const retained = entries.filter((entry) =>
      metadata.some((record) => record.id === entry.id),
    )
    const added = entries.filter(
      (entry) => !metadata.some((record) => record.id === entry.id),
    )
    if (
      retained.some(
        (record, index) =>
          index > 0 && Number(record.id) <= Number(retained[index - 1].id),
      ) ||
      [...retained, ...added].some(
        (record, index) => record.id !== entries[index].id,
      )
    )
      throw new ManagedResourceError({ code: "validation_failed" })
    const replacesAll = entries.every(
      (entry) => entry.secret.kind === "replace",
    )
    const replacesRetained = retained.some(
      (entry) => entry.secret.kind === "replace",
    )
    // Native append and indexed actions preserve unread keys on the server.
    // https://github.com/QuantumNous/new-api/blob/main/controller/channel.go
    if (replacesAll) {
      payload.key = entries
        .map((entry) =>
          entry.secret.kind === "replace" ? entry.secret.value.trim() : "",
        )
        .join("\n")
      payload.key_mode = "replace"
    } else if (!replacesRetained || !command.disclosedKeys) {
      const unchanged = retained.filter(
        (entry) => entry.secret.kind === "unchanged",
      )
      const appended = [
        ...retained.filter((entry) => entry.secret.kind === "replace"),
        ...added,
      ]
      const newKeys = appended.map((entry) =>
        entry.secret.kind === "replace" ? entry.secret.value.trim() : "",
      )
      if (
        newKeys.some((key) => !key) ||
        new Set(newKeys).size !== newKeys.length
      )
        throw new ManagedResourceError({ code: "validation_failed" })
      if (newKeys.length) {
        payload.key = newKeys.join("\n")
        payload.key_mode = "append"
      }
      // Confirm the native append (which may deduplicate) before any indexed writes.
      keyState = [
        ...metadata.map((record) => Number(record.fields.status)),
        ...appended.map(() => 1),
      ]
      for (const [index, entry] of [...unchanged, ...appended].entries()) {
        const nativeIndex =
          index < unchanged.length
            ? Number(entry.id)
            : metadata.length + index - unchanged.length
        const enabled = entry.fields.enabled !== "false"
        if (enabled !== (keyState[nativeIndex] === 1)) {
          keyActions.push({
            action: enabled ? "enable_key" : "disable_key",
            index: nativeIndex,
          })
        }
      }
      // New keys are in place and configured before old slots are removed.
      for (const record of [...metadata].reverse())
        if (!unchanged.some((entry) => entry.id === record.id))
          keyActions.push({ action: "delete_key", index: Number(record.id) })
      verificationCommand = {
        ...command,
        credentialPatch: { ...patch, entries: [...unchanged, ...appended] },
      }
    } else {
      if (replacesRetained) {
        const secret = command.disclosedKeys.join("\n")
        const current = newApiCredentialRecords(secret, detail)
        if ((await newApiKeyMetadataFingerprint(current)) !== patch.baseline)
          throw new ManagedResourceError({ code: "resource_changed" })
        payload.key = [
          ...current.map((record) => {
            const edit = entries.find((entry) => entry.id === record.id)
            return edit?.secret.kind === "replace"
              ? edit.secret.value.trim()
              : record.key
          }),
          ...added.map((entry) =>
            entry.secret.kind === "replace" ? entry.secret.value.trim() : "",
          ),
        ].join("\n")
        payload.key_mode = "replace"
      } else if (added.length) {
        payload.key = added
          .map((entry) =>
            entry.secret.kind === "replace" ? entry.secret.value.trim() : "",
          )
          .join("\n")
        payload.key_mode = "append"
      }
      for (const record of [...metadata].reverse())
        if (!entries.some((entry) => entry.id === record.id))
          keyActions.push({ action: "delete_key", index: Number(record.id) })
    }
    if (!keyState)
      entries.forEach((entry, index) => {
        const old = metadata.find((record) => record.id === entry.id)
        if (
          entry.fields.enabled !== undefined &&
          entry.fields.enabled !==
            (replacesAll
              ? metadata[index]?.fields.enabled ?? "true"
              : old?.fields.enabled ?? "true")
        )
          keyActions.push({
            action:
              entry.fields.enabled === "false" ? "disable_key" : "enable_key",
            index,
          })
      })
  }
  const result = keyState
    ? await channels.update(
        nativeConfig.config,
        payload,
        options,
        keyActions,
        keyState,
      )
    : keyActions.length
      ? await channels.update(nativeConfig.config, payload, options, keyActions)
      : await channels.update(nativeConfig.config, payload, options)
  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    return await verifyAdvancedSave(
      nativeConfig,
      verificationCommand,
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
