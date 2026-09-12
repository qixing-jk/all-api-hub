import {
  OCTOPUS_MANAGED_RESOURCE_FIELD_IDS as fields,
  OctopusOutboundTypeNames,
  OctopusOutboundTypeOptions,
} from "~/constants/octopus"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS as facts,
  MANAGED_RESOURCE_FAILURE_CODES as failures,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS as intents,
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  ManagedResourceError,
  MANAGED_RESOURCE_STATUSES as statuses,
  type ManagedResourceRef,
  type ResourceDisplayFacts,
  type ResourceFailure,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  defineNativeResourceKind,
  type NativeResourceEditorDefinition,
} from "~/services/apiAdapters/managedResources/factory"
import {
  octopusChannelEffect,
  runOctopusMutation,
} from "~/services/apiAdapters/managedSites/octopusMutation"
import {
  createChannel,
  deleteChannel,
  fetchRemoteModels,
  getChannel,
  getChannelKeyManagement,
  listChannels,
  updateChannel,
  usesChannelProtocolPaths,
} from "~/services/apiService/octopus"
import { ApiError } from "~/services/apiTransport/errors"
import {
  MANAGED_SITE_MUTATION_OUTCOMES as outcomes,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { buildOctopusBaseUrl } from "~/services/managedSites/providers/octopus"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import {
  OCTOPUS_CHANNEL_DETAIL_AVAILABILITY,
  OctopusOutboundType,
  type OctopusChannel,
  type OctopusCreateChannelInput,
  type OctopusFetchModelInput,
  type OctopusUpdateChannelInput,
} from "~/types/octopus"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"

import {
  resolveCredentialPatch,
  withCredentialListEditor,
  type CredentialListPatch,
} from "./credentialListEditor"
import {
  buildOctopusCreateCommand,
  buildOctopusUpdateCommand,
  isOctopusHttpUrl,
  octopusFieldDescriptors,
  octopusInitialValues,
  octopusModels,
  octopusSecretIntent,
  octopusSecretState,
  readOctopusString,
  validateOctopusValues,
} from "./octopusEditor"

type UpdateCommand = Omit<OctopusUpdateChannelInput, "id" | "source"> & {
  credentialPatch?: CredentialListPatch
}
const aborted = (options?: ResourceOperationOptions) => {
  if (options?.signal?.aborted)
    throw new ManagedResourceError({ code: failures.Aborted })
}
const assertLocator = (id: number) => {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ManagedResourceError({ code: failures.ValidationFailed })
  return id
}
const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof Error && error.name === "AbortError")
    return { code: failures.Aborted }
  if (error instanceof ApiError) {
    const code =
      error.statusCode === 401
        ? failures.AuthenticationFailed
        : error.statusCode === 403
          ? failures.PermissionDenied
          : error.statusCode === 404
            ? failures.NotFound
            : !error.statusCode || error.statusCode >= 500
              ? failures.Unavailable
              : failures.UpstreamRejected
    return {
      code,
      message: sanitizeSensitiveErrorText(error.message),
      ...(error.upstreamCode
        ? { upstreamCode: sanitizeSensitiveErrorText(error.upstreamCode) }
        : {}),
    }
  }
  return {
    code: failures.Unexpected,
    ...(error instanceof Error
      ? { message: sanitizeSensitiveErrorText(error.message) }
      : {}),
  }
}
const redactKnownSecrets = (
  message: string,
  secrets: readonly (string | undefined)[],
) => {
  for (const secret of secrets
    .filter((value): value is string => !!value)
    .sort((a, b) => b.length - a.length))
    message = message.split(secret).join("[REDACTED]")
  return sanitizeSensitiveErrorText(message)
}
const read = async <T>(
  options: ResourceOperationOptions | undefined,
  action: () => Promise<T>,
  secrets: readonly (string | undefined)[] = [],
): Promise<T> => {
  aborted(options)
  try {
    const result = await action()
    aborted(options)
    return result
  } catch (error) {
    const failure = mapFailure(error)
    throw new ManagedResourceError({
      ...failure,
      ...(failure.message
        ? { message: redactKnownSecrets(failure.message, secrets) }
        : {}),
      ...(failure.upstreamCode
        ? { upstreamCode: redactKnownSecrets(failure.upstreamCode, secrets) }
        : {}),
    })
  }
}
const toFacts = (
  detail: OctopusChannel,
  ref: ManagedResourceRef,
): ResourceDisplayFacts => {
  const summary =
    detail.detailAvailability === OCTOPUS_CHANNEL_DETAIL_AVAILABILITY.Summary
  const models = octopusModels(detail.model)
  const status = detail.enabled ? statuses.Enabled : statuses.Disabled
  const baseUrl = detail.base_urls[0]?.url ?? ""
  return {
    ref,
    displayName: detail.name,
    status,
    fields: [
      { fieldId: fields.Name, kind: facts.Text, value: detail.name },
      ...(summary
        ? []
        : [
            {
              fieldId: fields.Type,
              kind: facts.Text,
              value: String(detail.type),
            },
          ]),
      { fieldId: fields.Status, kind: facts.Text, value: status },
      { fieldId: fields.BaseUrl, kind: facts.Text, value: baseUrl },
      {
        fieldId: fields.Key,
        kind: facts.Secret,
        state: summary
          ? MANAGED_RESOURCE_SECRET_STATES.PermissionHidden
          : octopusSecretState(detail),
      },
      { fieldId: fields.Models, kind: facts.List, value: models },
    ],
    searchValues: [
      detail.name,
      ...(summary
        ? []
        : [String(detail.type), OctopusOutboundTypeNames[detail.type] ?? ""]),
      baseUrl,
      ...models,
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}
const isDetail = (value: unknown): value is OctopusChannel => {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<OctopusChannel>
  return (
    Number.isSafeInteger(item.id) &&
    Number(item.id) > 0 &&
    typeof item.name === "string" &&
    typeof item.type === "number" &&
    typeof item.enabled === "boolean" &&
    typeof item.model === "string" &&
    Array.isArray(item.base_urls) &&
    Array.isArray(item.keys)
  )
}
const uncertain = (): ManagedSiteMutationResult<OctopusChannel> => ({
  outcome: outcomes.Uncertain,
  diagnostic: {
    code: failures.MutationStateUncertain,
    message: failures.MutationStateUncertain,
  },
})

const sanitizeMutation = <T>(
  result: ManagedSiteMutationResult<T>,
  secrets: readonly (string | undefined)[],
): ManagedSiteMutationResult<T> => {
  if (result.outcome === outcomes.Succeeded) return result
  return {
    ...result,
    diagnostic: {
      message: redactKnownSecrets(result.diagnostic.message, secrets),
      ...(result.diagnostic.code === undefined
        ? {}
        : {
            code:
              typeof result.diagnostic.code === "string"
                ? redactKnownSecrets(result.diagnostic.code, secrets)
                : result.diagnostic.code,
          }),
      ...(result.diagnostic.statusCode === undefined
        ? {}
        : { statusCode: result.diagnostic.statusCode }),
    },
  }
}

/** Opens provider-native Octopus operations for editors and channel migration. */
export async function openOctopusNativeResourceOperations(
  options?: ResourceOperationOptions,
) {
  aborted(options)
  const preferences = await userPreferences.getPreferences()
  aborted(options)
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.OCTOPUS,
  )
  if (!resolved)
    throw new ManagedResourceError({ code: failures.ConfigurationRequired })
  const config = resolved.config
  const readConfigured = <T>(
    operationOptions: ResourceOperationOptions | undefined,
    action: () => Promise<T>,
    secrets: readonly (string | undefined)[] = [],
  ) => read(operationOptions, action, [config.password, ...secrets])
  if (!isOctopusHttpUrl(config.baseUrl))
    throw new ManagedResourceError({ code: failures.InvalidConfiguration })
  const scopeKey = normalizeManagedUpstreamResourceScopeKey(
    new URL(config.baseUrl.trim()).origin,
  )
  const get = async (
    id: number,
    operationOptions?: ResourceOperationOptions,
  ) => {
    assertLocator(id)
    return await readConfigured(operationOptions, async () => {
      const detail = await getChannel(config, id, operationOptions)
      if (!isDetail(detail) || detail.id !== id)
        throw new ManagedResourceError({ code: failures.Unexpected })
      return detail
    })
  }
  // New named keys use GORM default:true, which can override an explicit false.
  // Reconcile once against fresh detail; never replay creation or unknown writes.
  // Source: github.com/bestruirui/octopus/blob/master/internal/op/channel.go (syncChannelKeys)
  const reconcileDisabledKeys = async (
    result: ManagedSiteMutationResult<OctopusChannel>,
    requested: OctopusCreateChannelInput["keys"],
    operationOptions?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OctopusChannel>> => {
    if (
      result.outcome !== outcomes.Succeeded ||
      !isDetail(result.data) ||
      result.data.keyManagement !== "named" ||
      !requested?.some((key) => !key.enabled)
    )
      return result
    const partial = (): ManagedSiteMutationResult<OctopusChannel> => ({
      outcome: outcomes.Partial,
      completion: "uncertain",
      data: result.data,
      confirmedEffects: [
        result.confirmedEffects[0] ??
          octopusChannelEffect("resource-updated", result.data.id),
        ...result.confirmedEffects.slice(1),
      ],
      diagnostic: {
        code: failures.MutationStateUncertain,
        message: failures.MutationStateUncertain,
      },
    })
    try {
      const latest = await get(result.data.id, operationOptions)
      if (
        latest.keys.length !== requested.length ||
        requested.some(
          (key) =>
            !latest.keys.some(
              (saved) =>
                saved.name === key.name &&
                saved.channel_key === key.channel_key,
            ),
        )
      )
        return partial()
      const disabled = requested.filter((key) => !key.enabled)
      if (
        disabled.every(
          (key) =>
            latest.keys.find((saved) => saved.name === key.name)?.enabled ===
            false,
        )
      )
        return { ...result, data: latest }
      const correction = await runOctopusMutation({
        effect: octopusChannelEffect("resource-updated", latest.id),
        execute: () =>
          updateChannel(
            config,
            {
              id: latest.id,
              source: latest,
              keys: latest.keys.map((key) => ({
                ...key,
                originalName: key.name,
                enabled: disabled.some((wanted) => wanted.name === key.name)
                  ? false
                  : key.enabled,
              })),
            },
            operationOptions,
          ),
      })
      if (correction.outcome !== outcomes.Succeeded) return partial()
      const confirmed = await get(latest.id, operationOptions)
      if (
        confirmed.keys.length !== requested.length ||
        requested.some(
          (key) =>
            !confirmed.keys.some(
              (saved) =>
                saved.name === key.name &&
                saved.channel_key === key.channel_key &&
                saved.enabled === key.enabled,
            ),
        )
      )
        return partial()
      return {
        ...result,
        data: confirmed,
        confirmedEffects: [
          ...result.confirmedEffects,
          ...correction.confirmedEffects,
        ],
      }
    } catch {
      return partial()
    }
  }
  const loadSecret = async (
    id: number,
    operationOptions?: ResourceOperationOptions,
  ) => {
    const detail = await get(id, operationOptions)
    const key = detail.keys[0]?.channel_key
    if (!hasUsableManagedSiteChannelKey(key))
      throw new ManagedResourceError({ code: failures.Unavailable })
    return key
  }
  return {
    scopeKey,
    keyManagement: (operationOptions?: ResourceOperationOptions) =>
      getChannelKeyManagement(config, operationOptions),
    get,
    loadSecret,
    prepareMigrationBaseUrl: (
      baseUrl: string,
      type: OctopusOutboundType,
      operationOptions?: ResourceOperationOptions,
    ) =>
      readConfigured(operationOptions, async () => {
        if (!isOctopusHttpUrl(baseUrl))
          throw new ManagedResourceError({ code: failures.ValidationFailed })
        const protocolPaths = await usesChannelProtocolPaths(
          config,
          operationOptions,
        )
        if (!protocolPaths) return buildOctopusBaseUrl(baseUrl)
        // v0.13 appends /v1 protocol paths itself; imported version roots must
        // not produce /v1/v1. Preserve other custom prefixes without guessing.
        // Source: github.com/bestruirui/octopus/blob/27aa40dc0f3b2902bce3e96ccdba019d17041606/internal/model/channel.go
        const url = new URL(baseUrl.trim())
        url.pathname = url.pathname.replace(/\/+$/, "")
        // Volcengine uses unversioned protocol paths, preserving its API prefix.
        if (type !== OctopusOutboundType.Volcengine)
          url.pathname = url.pathname.replace(/\/v1$/, "")
        return url.toString().replace(/\/$/, "")
      }),
    list: async (
      query?: ResourceListQuery,
      operationOptions?: ResourceOperationOptions,
    ) =>
      readConfigured(operationOptions, async () => {
        const items = await listChannels(config, operationOptions)
        const keyword = query?.search?.trim().toLowerCase()
        const selected = keyword
          ? items.filter((item) =>
              [
                item.name,
                ...(item.detailAvailability ===
                OCTOPUS_CHANNEL_DETAIL_AVAILABILITY.Summary
                  ? []
                  : [
                      String(item.type),
                      OctopusOutboundTypeNames[item.type] ?? "",
                    ]),
                item.model,
                ...item.base_urls.map((url) => url.url),
              ].some((value) => value.toLowerCase().includes(keyword)),
            )
          : items
        return { items: selected, total: selected.length }
      }),
    create: async (
      command: OctopusCreateChannelInput,
      operationOptions?: ResourceOperationOptions,
    ): Promise<ManagedSiteMutationResult<OctopusChannel>> => {
      aborted(operationOptions)
      const created = await runOctopusMutation({
        effect: octopusChannelEffect("resource-created"),
        execute: () => createChannel(config, command, operationOptions),
      })
      const result = await reconcileDisabledKeys(
        created,
        command.keys,
        operationOptions,
      )
      // A success envelope without an identity cannot safely attribute creation.
      // Never replay a create merely because its response lacks channel data.
      return result.outcome === outcomes.Succeeded && !isDetail(result.data)
        ? uncertain()
        : sanitizeMutation(result, [
            config.password,
            command.key,
            ...(command.keys?.map((key) => key.channel_key) ?? []),
          ])
    },
    update: async (
      detail: OctopusChannel,
      command: UpdateCommand,
      operationOptions?: ResourceOperationOptions,
    ): Promise<ManagedSiteMutationResult<OctopusChannel>> => {
      assertLocator(detail.id)
      aborted(operationOptions)
      // The codec owns primary-key/URL edits and preserves additional entries.
      // v0.13 transport separately reloads raw detail for whole-body updates.
      // Source: github.com/bestruirui/octopus/blob/27aa40dc0f3b2902bce3e96ccdba019d17041606/internal/op/channel.go
      const result = await runOctopusMutation({
        effect: octopusChannelEffect("resource-updated", detail.id),
        execute: () =>
          updateChannel(
            config,
            { ...command, id: detail.id, source: detail },
            operationOptions,
          ),
      })
      if (result.outcome !== outcomes.Succeeded)
        return sanitizeMutation(result, [
          config.password,
          command.key,
          ...(command.keys?.map((key) => key.channel_key) ?? []),
          ...detail.keys.map((key) => key.channel_key),
        ])
      if (isDetail(result.data) && result.data.id === detail.id)
        return reconcileDisabledKeys(result, command.keys, operationOptions)
      try {
        return reconcileDisabledKeys(
          { ...result, data: await get(detail.id, operationOptions) },
          command.keys,
          operationOptions,
        )
      } catch {
        return uncertain()
      }
    },
    delete: async (id: number, operationOptions?: ResourceOperationOptions) => {
      assertLocator(id)
      aborted(operationOptions)
      return sanitizeMutation(
        await runOctopusMutation<null, void>({
          effect: octopusChannelEffect("resource-deleted", id),
          execute: () => deleteChannel(config, id, operationOptions),
          successData: () => undefined,
        }),
        [config.password],
      )
    },
    fetchDraftModels: (
      command: OctopusFetchModelInput,
      operationOptions?: ResourceOperationOptions,
    ) =>
      readConfigured(
        operationOptions,
        () => fetchRemoteModels(config, command, operationOptions),
        [
          command.key,
          ...(command.source?.keys.map((key) => key.channel_key) ?? []),
        ],
      ),
  }
}
type Operations = Awaited<
  ReturnType<typeof openOctopusNativeResourceOperations>
>
const editor = <T>(
  operations: Operations,
  definition: NativeResourceEditorDefinition<T>,
  detail?: OctopusChannel,
): NativeResourceEditorDefinition<T> => ({
  ...definition,
  ...(detail
    ? {
        loadSecret: async (
          fieldId: string,
          options?: ResourceOperationOptions,
        ) => {
          if (fieldId !== fields.Key)
            throw new ManagedResourceError({ code: failures.ValidationFailed })
          return operations.loadSecret(detail.id, options)
        },
      }
    : {}),
  loadOptions: async (fieldId, values, options) => {
    if (fieldId !== fields.Models)
      throw new ManagedResourceError({ code: failures.ValidationFailed })
    const intent = octopusSecretIntent(values)
    const key =
      intent.kind === intents.Replace
        ? intent.value.trim()
        : detail
          ? await operations.loadSecret(detail.id, options)
          : ""
    const baseUrl = readOctopusString(values, fields.BaseUrl)
    if (!isOctopusHttpUrl(baseUrl) || !hasUsableManagedSiteChannelKey(key))
      throw new ManagedResourceError({ code: failures.ValidationFailed })
    const models = await operations.fetchDraftModels(
      {
        type: Number(values[fields.Type]),
        baseUrl,
        key,
        ...(detail ? { source: detail, proxy: detail.proxy } : {}),
      },
      options,
    )
    return models.map((value) => ({ value }))
  },
})
export const octopusManagedResourceRegistration = defineNativeResourceKind({
  siteType: SITE_TYPES.OCTOPUS,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  capabilities: { canSearch: true },
  openConfig: openOctopusNativeResourceOperations,
  scopeKey: (operations: Operations) => operations.scopeKey,
  encodeLocator: (id: number) => String(assertLocator(id)),
  decodeLocator: (value: string) => assertLocator(Number(value)),
  locatorFromListItem: (detail: OctopusChannel) => detail.id,
  locatorFromDetail: (detail: OctopusChannel) => detail.id,
  list: (operations: Operations, query, options) =>
    operations.list(query, options),
  get: (operations: Operations, id, options) => operations.get(id, options),
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      validate: validateOctopusValues,
      sourceFieldIds: {
        [fields.Name]: "name",
        [fields.Type]: "channelType",
        [fields.Status]: "enabled",
        [fields.BaseUrl]: "baseUrl",
        [fields.Key]: "credential",
        [fields.Models]: "models",
      },
      project: (seed) => ({
        ...octopusInitialValues(),
        [fields.Type]: OctopusOutboundTypeOptions.some(
          ({ value }) => String(value) === String(seed.channelType),
        )
          ? String(seed.channelType)
          : octopusInitialValues()[fields.Type],
        [fields.Name]: seed.name,
        [fields.BaseUrl]: seed.baseUrl,
        [fields.Key]: { kind: intents.Replace, value: seed.credential },
        [fields.Models]: [...seed.models],
        [fields.Status]: seed.enabled ? statuses.Enabled : statuses.Disabled,
      }),
    },
  ],
  createEditor: async (
    operations: Operations,
    options?: ResourceOperationOptions,
  ) => {
    const base = editor(operations, {
      fields: octopusFieldDescriptors(),
      initialValues: octopusInitialValues(),
      validate: validateOctopusValues,
      buildCommand: buildOctopusCreateCommand,
    })
    const mode = await operations.keyManagement(options)
    return mode === "single"
      ? base
      : withCredentialListEditor(
          base,
          fields.Key,
          [],
          false,
          undefined,
          octopusCredentialFields(mode),
        )
  },
  editEditor: async (operations: Operations, detail: OctopusChannel) => {
    const base = editor(
      operations,
      {
        fields: octopusFieldDescriptors(detail),
        initialValues: octopusInitialValues(detail),
        validate: (values) => validateOctopusValues(values, detail),
        buildCommand: (values) => buildOctopusUpdateCommand(detail, values),
      },
      detail,
    )
    if (detail.keyManagement === "single" || detail.keys.length === 0)
      return base
    return withCredentialListEditor(
      base,
      fields.Key,
      octopusCredentialRecords(detail),
      true,
      async (loadOptions) =>
        octopusCredentialRecords(await operations.get(detail.id, loadOptions)),
      octopusCredentialFields(detail.keyManagement ?? "legacy"),
    )
  },
  create: async (
    operations: Operations,
    command: OctopusCreateChannelInput & {
      credentialPatch?: CredentialListPatch
    },
    options,
  ) => {
    const { credentialPatch, ...input } = command
    if (credentialPatch)
      input.keys = await resolveOctopusCredentials(credentialPatch)
    return operations.create(input, options)
  },
  update: async (
    operations: Operations,
    detail: OctopusChannel,
    command: UpdateCommand,
    options,
  ) => {
    const { credentialPatch, ...input } = command
    if (credentialPatch) {
      if (detail.keyManagement === "single")
        throw new ManagedResourceError({ code: "resource_changed" })
      input.keys = await resolveOctopusCredentials(credentialPatch, detail)
    }
    return operations.update(detail, input, options)
  },
  delete: (operations: Operations, id, options) =>
    operations.delete(id, options),
  mapFailure,
})

/** Native IDs/names survive edits; ordinary metadata never includes secret values. */
function octopusCredentialRecords(detail: OctopusChannel) {
  return detail.keys.map((key, index) => ({
    id: key.name ?? String(key.id ?? index),
    key: key.channel_key,
    fields: {
      enabled: String(key.enabled),
      remark: key.remark ?? "",
      name: key.name ?? "",
    },
  }))
}
/** Select metadata supported by the native key protocol. */
function octopusCredentialFields(mode: "legacy" | "named") {
  return [
    { fieldId: "enabled", type: "boolean" as const },
    { fieldId: mode === "named" ? "name" : "remark", type: "text" as const },
  ]
}
/** Resolve edited credentials while preserving native key identities. */
async function resolveOctopusCredentials(
  patch: CredentialListPatch,
  detail?: OctopusChannel,
) {
  const records = await resolveCredentialPatch(
    patch,
    detail ? octopusCredentialRecords(detail) : [],
  )
  const keys = records.map((record) => {
    const saved = detail?.keys.find(
      (key, index) => (key.name ?? String(key.id ?? index)) === record.id,
    )
    return {
      ...saved,
      originalName: saved?.name,
      channel_key: record.key,
      enabled: record.fields.enabled !== "false",
      remark: record.fields.remark ?? "",
      name: record.fields.name || saved?.name || `key-${record.id}`,
    }
  })
  if (new Set(keys.map((key) => key.name)).size !== keys.length)
    throw new ManagedResourceError({ code: "validation_failed" })
  return keys
}
