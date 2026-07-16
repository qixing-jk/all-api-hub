import {
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  type AxonHubChannelStatus,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import {
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_FIELD_TYPES,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceListQuery,
  type ResourceOperationOptions,
  type ResourceSecretState,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  defineNativeResourceKind,
  type NativeResourceEditorDefinition,
  type NativeResourceMutationResult,
} from "~/services/apiAdapters/managedResources/factory"
import {
  AxonHubRequestError,
  createAxonHubChannel,
  deleteAxonHubChannel,
  getAxonHubChannel,
  listAxonHubChannelPage,
  signIn,
  updateAxonHubChannel,
  updateAxonHubChannelStatus,
  type AxonHubChannelPage,
  type AxonHubRequestFailureKind,
} from "~/services/apiService/axonHub"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { userPreferences } from "~/services/preferences/userPreferences"
import type {
  AxonHubChannel,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"

export const AXON_HUB_EDITABLE_FIELD_IDS = [
  "name",
  "type",
  "baseURL",
  "status",
  "key",
  "supportedModels",
  "manualModels",
  "defaultTestModel",
  "autoSyncSupportedModels",
  "autoSyncModelPattern",
  "tags",
  "orderingWeight",
  "remark",
  "extraModelPrefix",
] as const

export type AxonHubNativeFailure = {
  code:
    | "configuration_required"
    | "invalid_configuration"
    | "authentication_failed"
    | "permission_denied"
    | "not_found"
    | "unavailable"
    | "upstream_rejected"
    | "aborted"
    | "unexpected"
  dispatch: "before" | "after"
}

export class AxonHubNativeError extends Error {
  constructor(readonly failure: AxonHubNativeFailure) {
    super(failure.code)
    this.name = "AxonHubNativeError"
  }
}

type AxonHubNativeResourcePage = {
  readonly items: readonly AxonHubChannelPage["items"][number][]
  readonly nextCursor?: AxonHubChannelPage["nextCursor"]
}

export interface AxonHubNativeResourceOperations {
  readonly scopeKey: string
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<AxonHubNativeResourcePage>
  get(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<AxonHubChannel>
  create(
    input: AxonHubCreateChannelInput,
    desiredStatus: AxonHubChannelStatus,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<AxonHubChannel, AxonHubNativeFailure>>
  update(
    detail: AxonHubChannel,
    input: AxonHubUpdateChannelInput,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<AxonHubChannel, AxonHubNativeFailure>>
  delete(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<void, AxonHubNativeFailure>>
}

type AxonHubCreateCommand = {
  input: AxonHubCreateChannelInput
  desiredStatus: AxonHubChannelStatus
}

// beta5 requires apiKeys for these audited regular-key types; structured
// AWS/GCP/OAuth and unknown future types stay excluded by default.
// Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/data/schema.ts
const REGULAR_AXON_HUB_CHANNEL_TYPES = [
  AXON_HUB_CHANNEL_TYPE.OPENAI,
  AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
  AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
  AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI,
  AXON_HUB_CHANNEL_TYPE.GEMINI,
  AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX,
  AXON_HUB_CHANNEL_TYPE.DEEPSEEK,
  AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC,
  AXON_HUB_CHANNEL_TYPE.OPENROUTER,
  AXON_HUB_CHANNEL_TYPE.XAI,
  AXON_HUB_CHANNEL_TYPE.SILICONFLOW,
  AXON_HUB_CHANNEL_TYPE.VOLCENGINE,
  AXON_HUB_CHANNEL_TYPE.NANOGPT,
  AXON_HUB_CHANNEL_TYPE.OLLAMA,
] as const

const REGULAR_AXON_HUB_CHANNEL_TYPE_SET = new Set<string>(
  REGULAR_AXON_HUB_CHANNEL_TYPES,
)

// Resource-wide search is client-side, so cap both upstream work and retained
// input at conservative levels well above normal managed-site inventories.
const AXON_HUB_SEARCH_PAGE_LIMIT = 100
const AXON_HUB_SEARCH_ITEM_LIMIT = 5_000

const normalizeOrigin = (value: string) => {
  const url = new URL(value.trim())
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("invalid origin")
  }
  return url.origin
}

const controlledNativeFailures = new WeakSet<object>()

const createControlledNativeFailure = (
  code: AxonHubNativeFailure["code"],
  dispatch: AxonHubNativeFailure["dispatch"] = "before",
) => {
  const failure: AxonHubNativeFailure = { code, dispatch }
  controlledNativeFailures.add(failure)
  return failure
}

const createNativeFailure = (
  code: AxonHubNativeFailure["code"],
  dispatch: AxonHubNativeFailure["dispatch"] = "before",
) => new AxonHubNativeError(createControlledNativeFailure(code, dispatch))

const AXON_HUB_NATIVE_FAILURE_CODES = new Set<string>([
  "configuration_required",
  "invalid_configuration",
  "authentication_failed",
  "permission_denied",
  "not_found",
  "unavailable",
  "upstream_rejected",
  "aborted",
  "unexpected",
])

const AXON_HUB_REQUEST_FAILURE_CODES = {
  authentication: "authentication_failed",
  permission: "permission_denied",
  "not-found": "not_found",
  "upstream-rejected": "upstream_rejected",
  protocol: "unexpected",
  unavailable: "unavailable",
  aborted: "aborted",
} as const satisfies Record<
  AxonHubRequestFailureKind,
  AxonHubNativeFailure["code"]
>

const isAxonHubNativeFailure = (
  value: unknown,
): value is AxonHubNativeFailure =>
  typeof value === "object" &&
  value !== null &&
  controlledNativeFailures.has(value) &&
  "code" in value &&
  typeof value.code === "string" &&
  AXON_HUB_NATIVE_FAILURE_CODES.has(value.code) &&
  "dispatch" in value &&
  (value.dispatch === "before" || value.dispatch === "after")

const mapRequestFailure = (error: unknown): AxonHubNativeError => {
  if (error instanceof AxonHubNativeError) return error
  if (!(error instanceof AxonHubRequestError)) {
    return createNativeFailure("unexpected")
  }

  const dispatch = error.dispatch === "dispatched" ? "after" : "before"
  return createNativeFailure(
    AXON_HUB_REQUEST_FAILURE_CODES[error.kind],
    dispatch,
  )
}

const mutationFailure = <T>(
  error: unknown,
): NativeResourceMutationResult<T, AxonHubNativeFailure> => {
  const failure = mapRequestFailure(error).failure
  const acknowledgementMayBeLost =
    failure.dispatch === "after" &&
    (failure.code === "unavailable" ||
      failure.code === "aborted" ||
      failure.code === "upstream_rejected" ||
      failure.code === "unexpected")
  return acknowledgementMayBeLost
    ? { certainty: "possibly-applied" }
    : { certainty: "not-applied", failure }
}

const callRead = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw mapRequestFailure(error)
  }
}

/** Opens a validated, scope-bound AxonHub native resource session. */
export async function openAxonHubNativeResourceOperations(
  options?: ResourceOperationOptions,
): Promise<AxonHubNativeResourceOperations> {
  let preferences: Awaited<ReturnType<typeof userPreferences.getPreferences>>
  try {
    preferences = await userPreferences.getPreferences()
  } catch (error) {
    throw mapRequestFailure(error)
  }

  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.AXON_HUB,
  )
  if (!resolved) throw createNativeFailure("configuration_required")

  let scopeKey: string
  let config: AxonHubConfig
  try {
    scopeKey = normalizeOrigin(resolved.config.baseUrl)
    const email = resolved.config.email.trim()
    const password = resolved.config.password.trim()
    if (!email || !password) throw new Error("invalid credentials")
    config = {
      baseUrl: resolved.config.baseUrl,
      email,
      password,
    }
  } catch {
    throw createNativeFailure("invalid_configuration")
  }

  const requestOptions = (operationOptions?: ResourceOperationOptions) =>
    operationOptions?.signal ? { signal: operationOptions.signal } : undefined

  await callRead(() => signIn(config, requestOptions(options)))

  const assertRef = (ref: ManagedResourceRef) => {
    if (
      ref.siteType !== SITE_TYPES.AXON_HUB ||
      ref.kind !== MANAGED_RESOURCE_KINDS.Channel ||
      ref.scopeKey !== scopeKey ||
      !ref.resourceId
    ) {
      throw createNativeFailure("unexpected")
    }
  }

  return {
    scopeKey,
    list: async (query, operationOptions) => {
      const normalizedSearch = query?.search?.trim().toLowerCase() ?? ""
      if (!normalizedSearch) {
        return callRead(async () => {
          const page = await listAxonHubChannelPage(
            config,
            {
              ...(query?.cursor ? { cursor: query.cursor } : {}),
              limit: query?.limit ?? 100,
            },
            requestOptions(operationOptions),
          )
          return {
            items: page.items,
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          }
        })
      }

      return callRead(async () => {
        const items: AxonHubChannel[] = []
        const seenCursors = new Set<string>()
        let cursor: string | undefined
        let pageCount = 0
        let itemCount = 0
        do {
          if (pageCount >= AXON_HUB_SEARCH_PAGE_LIMIT) {
            throw createNativeFailure("unexpected")
          }
          pageCount += 1
          const page = await listAxonHubChannelPage(
            config,
            { ...(cursor ? { cursor } : {}), limit: 100 },
            operationOptions?.signal
              ? { signal: operationOptions.signal }
              : undefined,
          )
          itemCount += page.items.length
          if (itemCount > AXON_HUB_SEARCH_ITEM_LIMIT) {
            throw createNativeFailure("unexpected")
          }
          items.push(
            ...page.items.filter((item) =>
              searchableValues(item).some((value) =>
                value.toLowerCase().includes(normalizedSearch),
              ),
            ),
          )
          const nextCursor = page.nextCursor
          if (nextCursor && seenCursors.has(nextCursor)) {
            throw createNativeFailure("unexpected")
          }
          if (nextCursor) seenCursors.add(nextCursor)
          cursor = nextCursor
        } while (cursor)
        return { items }
      })
    },
    get: (ref, operationOptions) => {
      assertRef(ref)
      return callRead(() =>
        getAxonHubChannel(
          config,
          ref.resourceId,
          requestOptions(operationOptions),
        ),
      )
    },
    create: async (input, desiredStatus, operationOptions) => {
      let created: AxonHubChannel
      try {
        created = await createAxonHubChannel(
          config,
          input,
          requestOptions(operationOptions),
        )
      } catch (error) {
        return mutationFailure(error)
      }

      if (desiredStatus !== AXON_HUB_CHANNEL_STATUS.ENABLED) {
        return { certainty: "applied", value: created }
      }

      try {
        await updateAxonHubChannelStatus(
          config,
          created.id,
          desiredStatus,
          requestOptions(operationOptions),
        )
        return {
          certainty: "applied",
          value: { ...created, status: desiredStatus },
        }
      } catch {
        return { certainty: "partially-applied" }
      }
    },
    update: async (detail, input, operationOptions) => {
      try {
        return {
          certainty: "applied",
          value: await updateAxonHubChannel(
            config,
            detail.id,
            input,
            requestOptions(operationOptions),
          ),
        }
      } catch (error) {
        return mutationFailure(error)
      }
    },
    delete: async (ref, operationOptions) => {
      assertRef(ref)
      try {
        const deleted = await deleteAxonHubChannel(
          config,
          ref.resourceId,
          requestOptions(operationOptions),
        )
        if (!deleted) {
          return {
            certainty: "not-applied",
            failure: createControlledNativeFailure(
              "upstream_rejected",
              "after",
            ),
          }
        }
        return { certainty: "applied", value: undefined }
      } catch (error) {
        const failure = mapRequestFailure(error).failure
        if (failure.code === "not_found") {
          return { certainty: "applied", value: undefined }
        }
        return mutationFailure(new AxonHubNativeError(failure))
      }
    },
  }
}

const searchableValues = (channel: AxonHubChannel) => [
  channel.id,
  channel.name,
  String(channel.type),
  channel.baseURL ?? "",
  String(channel.status),
  ...(channel.supportedModels ?? []),
  ...(channel.tags ?? []),
]

const toStatus = (status: string): ResourceDisplayFacts["status"] => {
  switch (status) {
    case AXON_HUB_CHANNEL_STATUS.ENABLED:
      return "enabled"
    case AXON_HUB_CHANNEL_STATUS.DISABLED:
      return "disabled"
    case AXON_HUB_CHANNEL_STATUS.ARCHIVED:
      return "archived"
    case "auto-disabled":
      return "auto-disabled"
    default:
      return "unknown"
  }
}

const getCredentialState = (channel: AxonHubChannel): ResourceSecretState => {
  if (channel.credentials === null) return "permission-hidden"
  const keys = [
    ...(channel.credentials?.apiKeys ?? []),
    ...(channel.credentials?.apiKey ? [channel.credentials.apiKey] : []),
  ].map((key) => key.trim())
  if (keys.some(hasUsableApiTokenKey)) return "available"
  if (keys.some(Boolean)) return "masked"
  return "unavailable"
}

const detailFacts = (
  channel: AxonHubChannel,
): readonly ResourceDisplayFact[] => [
  { fieldId: "name", kind: "text", value: channel.name },
  { fieldId: "type", kind: "text", value: String(channel.type) },
  { fieldId: "baseURL", kind: "text", value: channel.baseURL ?? "" },
  { fieldId: "status", kind: "text", value: String(channel.status) },
  { fieldId: "key", kind: "secret", state: getCredentialState(channel) },
  {
    fieldId: "supportedModels",
    kind: "list",
    value: channel.supportedModels ?? [],
  },
  {
    fieldId: "manualModels",
    kind: "list",
    value: channel.manualModels ?? [],
  },
  {
    fieldId: "defaultTestModel",
    kind: "text",
    value: channel.defaultTestModel ?? "",
  },
  {
    fieldId: "autoSyncSupportedModels",
    kind: "boolean",
    value: channel.autoSyncSupportedModels ?? false,
  },
  {
    fieldId: "autoSyncModelPattern",
    kind: "text",
    value: channel.autoSyncModelPattern ?? "",
  },
  { fieldId: "tags", kind: "list", value: channel.tags ?? [] },
  {
    fieldId: "orderingWeight",
    kind: "number",
    value: channel.orderingWeight ?? 0,
  },
  { fieldId: "remark", kind: "text", value: channel.remark ?? "" },
  {
    fieldId: "extraModelPrefix",
    kind: "text",
    value: channel.settings?.extraModelPrefix ?? "",
  },
]

const toFacts = (
  channel: AxonHubChannel,
  ref: ManagedResourceRef,
  fields: readonly ResourceDisplayFact[],
): ResourceDisplayFacts => {
  const status = toStatus(channel.status)
  const supportedState = status !== "unknown"
  return {
    ref,
    displayName: channel.name,
    status,
    fields,
    actions: { canUpdate: supportedState, canDelete: supportedState },
  }
}

const toListFacts = (channel: AxonHubChannel, ref: ManagedResourceRef) => {
  const selectedFieldIds = new Set(
    getAccountSiteDefinition(SITE_TYPES.AXON_HUB)?.managedResource
      ?.tableFieldIds ?? [],
  )
  return toFacts(
    channel,
    ref,
    detailFacts(channel).filter((fact) => selectedFieldIds.has(fact.fieldId)),
  )
}

const readString = (values: EditableResourceProjection, fieldId: string) => {
  const value = values[fieldId]
  return typeof value === "string" ? value.trim() : ""
}

const readBoolean = (values: EditableResourceProjection, fieldId: string) =>
  values[fieldId] === true

const readNumber = (values: EditableResourceProjection, fieldId: string) => {
  const value = values[fieldId]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

const readList = (values: EditableResourceProjection, fieldId: string) => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

const readSecretIntent = (
  values: EditableResourceProjection,
): SecretEditIntent => {
  const value = values.key
  if (typeof value === "object" && value !== null && "kind" in value) {
    if (value.kind === "unchanged") return { kind: "unchanged" }
    if (value.kind === "clear") return { kind: "clear" }
    if (value.kind === "replace" && typeof value.value === "string") {
      return { kind: "replace", value: value.value }
    }
  }
  return { kind: "unchanged" }
}

const normalizeList = (values: readonly string[]) =>
  values.map((value) => value.trim()).filter(Boolean)

const hasInvalidListValues = (values: readonly string[]) => {
  const normalized = values.map((value) => value.trim())
  return (
    normalized.some((value) => !value) ||
    new Set(normalized).size !== normalized.length
  )
}

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

const validateValues = (
  values: EditableResourceProjection,
  context: { create: boolean; detail?: AxonHubChannel },
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  const name = readString(values, "name")
  const type = readString(values, "type")
  const baseURL = readString(values, "baseURL")
  const supportedModels = readList(values, "supportedModels")
  const manualModels = readList(values, "manualModels")
  const defaultTestModel = readString(values, "defaultTestModel")
  const secretIntent = readSecretIntent(values)
  const status = readString(values, "status")
  const specialCredentialType = context.detail
    ? !REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(String(context.detail.type))
    : false

  if (!name) {
    issues.push({
      fieldId: "name",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (!type) {
    issues.push({
      fieldId: "type",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  } else if (
    (!specialCredentialType && !REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(type)) ||
    (specialCredentialType && type !== context.detail?.type)
  ) {
    issues.push({
      fieldId: "type",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (baseURL && !isHttpUrl(baseURL)) {
    issues.push({
      fieldId: "baseURL",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (
    (context.create &&
      (secretIntent.kind !== "replace" || !secretIntent.value.trim())) ||
    secretIntent.kind === "clear" ||
    (secretIntent.kind === "replace" && !secretIntent.value.trim()) ||
    (specialCredentialType && secretIntent.kind !== "unchanged")
  ) {
    issues.push({
      fieldId: "key",
      code: context.create
        ? MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required
        : MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (hasInvalidListValues(supportedModels)) {
    issues.push({
      fieldId: "supportedModels",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (supportedModels.length === 0) {
    issues.push({
      fieldId: "supportedModels",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (hasInvalidListValues(manualModels)) {
    issues.push({
      fieldId: "manualModels",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (!defaultTestModel) {
    issues.push({
      fieldId: "defaultTestModel",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  } else if (
    defaultTestModel &&
    !new Set([
      ...normalizeList(supportedModels),
      ...normalizeList(manualModels),
    ]).has(defaultTestModel)
  ) {
    issues.push({
      fieldId: "defaultTestModel",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InconsistentValue,
    })
  }
  const supportedStatuses = context.create
    ? [AXON_HUB_CHANNEL_STATUS.ENABLED, AXON_HUB_CHANNEL_STATUS.DISABLED]
    : [
        AXON_HUB_CHANNEL_STATUS.ENABLED,
        AXON_HUB_CHANNEL_STATUS.DISABLED,
        AXON_HUB_CHANNEL_STATUS.ARCHIVED,
        ...(context.detail ? [String(context.detail.status)] : []),
      ]
  if (!supportedStatuses.includes(status)) {
    issues.push({
      fieldId: "status",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  const orderingWeight = values.orderingWeight
  if (!Number.isInteger(orderingWeight)) {
    issues.push({
      fieldId: "orderingWeight",
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }

  return issues.length ? { valid: false, issues } : { valid: true }
}

const createFieldDescriptors = (
  detail?: AxonHubChannel,
): readonly ResourceFieldDescriptor[] => {
  const specialCredentialType = detail
    ? !REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(String(detail.type))
    : false
  const typeOptions =
    specialCredentialType && detail
      ? [{ value: String(detail.type) }]
      : REGULAR_AXON_HUB_CHANNEL_TYPES.map((value) => ({ value }))
  const currentStatus = detail ? String(detail.status) : undefined
  const statusValues = detail
    ? [
        AXON_HUB_CHANNEL_STATUS.ENABLED,
        AXON_HUB_CHANNEL_STATUS.DISABLED,
        AXON_HUB_CHANNEL_STATUS.ARCHIVED,
        ...(currentStatus &&
        currentStatus !== AXON_HUB_CHANNEL_STATUS.ENABLED &&
        currentStatus !== AXON_HUB_CHANNEL_STATUS.DISABLED &&
        currentStatus !== AXON_HUB_CHANNEL_STATUS.ARCHIVED
          ? [currentStatus]
          : []),
      ]
    : [AXON_HUB_CHANNEL_STATUS.ENABLED, AXON_HUB_CHANNEL_STATUS.DISABLED]
  return [
    {
      fieldId: "name",
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      fieldId: "type",
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: typeOptions,
    },
    {
      fieldId: "baseURL",
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    },
    {
      fieldId: "status",
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: statusValues.map((value) => ({ value })),
    },
    {
      fieldId: "key",
      type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
      secretState: detail ? getCredentialState(detail) : "unavailable",
      allowClear: false,
    },
    {
      fieldId: "supportedModels",
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      options: [],
    },
    {
      fieldId: "manualModels",
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      options: [],
    },
    {
      fieldId: "defaultTestModel",
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      fieldId: "autoSyncSupportedModels",
      type: MANAGED_RESOURCE_FIELD_TYPES.Boolean,
    },
    {
      fieldId: "autoSyncModelPattern",
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    },
    {
      fieldId: "tags",
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      options: [],
    },
    {
      fieldId: "orderingWeight",
      type: MANAGED_RESOURCE_FIELD_TYPES.Number,
      step: 1,
    },
    {
      fieldId: "remark",
      type: MANAGED_RESOURCE_FIELD_TYPES.Textarea,
      rows: 3,
    },
    {
      fieldId: "extraModelPrefix",
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    },
  ]
}

const createInitialValues = (): EditableResourceProjection => ({
  name: "",
  type: AXON_HUB_CHANNEL_TYPE.OPENAI,
  baseURL: "",
  status: AXON_HUB_CHANNEL_STATUS.DISABLED,
  key: { kind: "unchanged" },
  supportedModels: [],
  manualModels: [],
  defaultTestModel: "",
  autoSyncSupportedModels: false,
  autoSyncModelPattern: "",
  tags: [],
  orderingWeight: 0,
  remark: "",
  extraModelPrefix: "",
})

const editInitialValues = (
  detail: AxonHubChannel,
): EditableResourceProjection => ({
  name: detail.name,
  type: String(detail.type),
  baseURL: detail.baseURL ?? "",
  status: String(detail.status),
  key: { kind: "unchanged" },
  supportedModels: [...(detail.supportedModels ?? [])],
  manualModels: [...(detail.manualModels ?? [])],
  defaultTestModel: detail.defaultTestModel ?? "",
  autoSyncSupportedModels: detail.autoSyncSupportedModels ?? false,
  autoSyncModelPattern: detail.autoSyncModelPattern ?? "",
  tags: [...(detail.tags ?? [])],
  orderingWeight: detail.orderingWeight ?? 0,
  remark: detail.remark ?? "",
  extraModelPrefix: detail.settings?.extraModelPrefix ?? "",
})

const buildCreateCommand = (
  values: EditableResourceProjection,
): AxonHubCreateCommand => {
  const baseURL = readString(values, "baseURL")
  const secret = readSecretIntent(values)
  const credential = secret.kind === "replace" ? secret.value.trim() : ""
  const extraModelPrefix = readString(values, "extraModelPrefix")
  return {
    desiredStatus:
      readString(values, "status") === AXON_HUB_CHANNEL_STATUS.ENABLED
        ? AXON_HUB_CHANNEL_STATUS.ENABLED
        : AXON_HUB_CHANNEL_STATUS.DISABLED,
    input: {
      type: readString(values, "type"),
      name: readString(values, "name"),
      ...(baseURL ? { baseURL } : {}),
      credentials: { apiKeys: [credential] },
      supportedModels: normalizeList(readList(values, "supportedModels")),
      manualModels: normalizeList(readList(values, "manualModels")),
      autoSyncSupportedModels: readBoolean(values, "autoSyncSupportedModels"),
      autoSyncModelPattern: readString(values, "autoSyncModelPattern") || null,
      tags: normalizeList(readList(values, "tags")),
      defaultTestModel: readString(values, "defaultTestModel"),
      settings: { extraModelPrefix },
      orderingWeight: readNumber(values, "orderingWeight"),
      remark: readString(values, "remark") || null,
    },
  }
}

const arraysEqual = (first: readonly string[], second: readonly string[]) =>
  first.length === second.length &&
  first.every((value, index) => value === second[index])

const fieldChanged = (
  values: EditableResourceProjection,
  baseline: EditableResourceProjection,
  fieldId: string,
) => {
  const value = values[fieldId]
  const initialValue = baseline[fieldId]
  if (Array.isArray(value) && Array.isArray(initialValue)) {
    return !arraysEqual(value, initialValue)
  }
  return value !== initialValue
}

const addNullableTextDiff = (
  input: AxonHubUpdateChannelInput,
  values: EditableResourceProjection,
  baseline: EditableResourceProjection,
  fieldId: "baseURL" | "autoSyncModelPattern" | "remark",
  clearField: "clearBaseURL" | "clearAutoSyncModelPattern" | "clearRemark",
) => {
  if (!fieldChanged(values, baseline, fieldId)) return
  const next = readString(values, fieldId)
  if (next) input[fieldId] = next
  else input[clearField] = true
}

const buildUpdateCommand = (
  detail: AxonHubChannel,
  baseline: EditableResourceProjection,
  values: EditableResourceProjection,
): AxonHubUpdateChannelInput => {
  const input: AxonHubUpdateChannelInput = {}
  const name = readString(values, "name")
  const type = readString(values, "type")
  const status = readString(values, "status")
  if (fieldChanged(values, baseline, "name")) input.name = name
  if (fieldChanged(values, baseline, "type")) input.type = type
  if (fieldChanged(values, baseline, "status")) input.status = status

  addNullableTextDiff(input, values, baseline, "baseURL", "clearBaseURL")
  addNullableTextDiff(
    input,
    values,
    baseline,
    "autoSyncModelPattern",
    "clearAutoSyncModelPattern",
  )
  addNullableTextDiff(input, values, baseline, "remark", "clearRemark")

  const secret = readSecretIntent(values)
  if (secret.kind === "replace") {
    input.credentials = { apiKeys: [secret.value.trim()] }
  }

  const supportedModels = normalizeList(readList(values, "supportedModels"))
  if (fieldChanged(values, baseline, "supportedModels")) {
    input.supportedModels = supportedModels
  }
  const manualModels = normalizeList(readList(values, "manualModels"))
  if (fieldChanged(values, baseline, "manualModels")) {
    if (manualModels.length) input.manualModels = manualModels
    else input.clearManualModels = true
  }
  const tags = normalizeList(readList(values, "tags"))
  if (fieldChanged(values, baseline, "tags")) {
    if (tags.length) input.tags = tags
    else input.clearTags = true
  }

  const defaultTestModel = readString(values, "defaultTestModel")
  if (fieldChanged(values, baseline, "defaultTestModel")) {
    input.defaultTestModel = defaultTestModel
  }
  const autoSyncSupportedModels = readBoolean(values, "autoSyncSupportedModels")
  if (fieldChanged(values, baseline, "autoSyncSupportedModels")) {
    input.autoSyncSupportedModels = autoSyncSupportedModels
  }
  const orderingWeight = readNumber(values, "orderingWeight")
  if (fieldChanged(values, baseline, "orderingWeight")) {
    input.orderingWeight = orderingWeight
  }

  const extraModelPrefix = readString(values, "extraModelPrefix")
  if (fieldChanged(values, baseline, "extraModelPrefix")) {
    input.settings = {
      ...(detail.settings ?? {}),
      extraModelPrefix,
    }
  }
  return input
}

const createEditor =
  (): NativeResourceEditorDefinition<AxonHubCreateCommand> => ({
    fields: createFieldDescriptors(),
    initialValues: createInitialValues(),
    validate: (values) => validateValues(values, { create: true }),
    buildCommand: buildCreateCommand,
  })

const editEditor = (
  detail: AxonHubChannel,
): NativeResourceEditorDefinition<AxonHubUpdateChannelInput> => {
  const initialValues = editInitialValues(detail)
  return {
    fields: createFieldDescriptors(detail),
    initialValues,
    validate: (values) => validateValues(values, { create: false, detail }),
    buildCommand: (values) => buildUpdateCommand(detail, initialValues, values),
  }
}

const mapFailure = (error: unknown): ResourceFailure => {
  const failure =
    error instanceof AxonHubNativeError
      ? error.failure
      : isAxonHubNativeFailure(error)
        ? error
        : mapRequestFailure(error).failure
  return { code: failure.code }
}

const axonHubNativeDefinition = {
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  supportsSearch: true,
  openConfig: openAxonHubNativeResourceOperations,
  scopeKey: (operations: AxonHubNativeResourceOperations) =>
    operations.scopeKey,
  encodeLocator: (locator: string) => locator,
  decodeLocator: (resourceId: string) => resourceId,
  locatorFromListItem: (item: AxonHubChannel) => item.id,
  locatorFromDetail: (detail: AxonHubChannel) => detail.id,
  list: (
    operations: AxonHubNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => operations.list(query, options),
  get: (
    operations: AxonHubNativeResourceOperations,
    locator: string,
    options?: ResourceOperationOptions,
  ) =>
    operations.get(
      {
        siteType: SITE_TYPES.AXON_HUB,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        scopeKey: operations.scopeKey,
        resourceId: locator,
      },
      options,
    ),
  toListFacts,
  toDetailFacts: (detail: AxonHubChannel, ref: ManagedResourceRef) =>
    toFacts(detail, ref, detailFacts(detail)),
  createEditor: async () => createEditor(),
  editEditor: (
    _operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
  ) => editEditor(detail),
  create: (
    operations: AxonHubNativeResourceOperations,
    command: AxonHubCreateCommand,
    options?: ResourceOperationOptions,
  ) => operations.create(command.input, command.desiredStatus, options),
  update: (
    operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
    command: AxonHubUpdateChannelInput,
    options?: ResourceOperationOptions,
  ) => operations.update(detail, command, options),
  delete: (
    operations: AxonHubNativeResourceOperations,
    locator: string,
    options?: ResourceOperationOptions,
  ) =>
    operations.delete(
      {
        siteType: SITE_TYPES.AXON_HUB,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        scopeKey: operations.scopeKey,
        resourceId: locator,
      },
      options,
    ),
  mapFailure,
}

export const axonHubManagedResourceRegistration = defineNativeResourceKind(
  axonHubNativeDefinition,
)
