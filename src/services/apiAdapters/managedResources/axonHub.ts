import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  isAxonHubModelAutoSyncSupported,
  type AxonHubChannelFieldId,
  type AxonHubChannelStatus,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedChannelImportCreateSeed,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceListQuery,
  type ResourceOperationOptions,
  type ResourceSecretReplacementBlockReason,
  type ResourceSecretState,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  defineNativeResourceKind,
  type NativeResourceEditorDefinition,
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
import {
  createManagedSiteMutationSequence,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationDiagnostic,
  type ManagedSiteMutationResult,
  type ManagedSiteMutationSequence,
} from "~/services/managedSites/mutations"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { userPreferences } from "~/services/preferences/userPreferences"
import type {
  AxonHubChannel,
  AxonHubChannelMutationReceipt,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"

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
  constructor(
    readonly failure: AxonHubNativeFailure,
    override readonly cause?: unknown,
  ) {
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
  loadSecret(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<string>
  create(
    input: AxonHubCreateChannelInput,
    desiredStatus: AxonHubChannelStatus,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<AxonHubChannel>>
  update(
    detail: AxonHubChannel,
    input: AxonHubNativeChannelPatch,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<AxonHubChannel>>
  delete(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
}

type AxonHubCreateCommand = {
  input: AxonHubCreateChannelInput
  desiredStatus: AxonHubChannelStatus
}

// Keep the product-facing edit contract narrower than AxonHub's generated
// UpdateChannelInput. Aggregate replacements such as settings, policies, and
// endpoints are intentionally absent because an older client cannot preserve
// members added by a newer server.
type AxonHubNativeChannelPatch = Pick<
  AxonHubUpdateChannelInput,
  | "type"
  | "baseURL"
  | "name"
  | "status"
  | "credentials"
  | "supportedModels"
  | "manualModels"
  | "autoSyncSupportedModels"
  | "autoSyncModelPattern"
  | "clearAutoSyncModelPattern"
  | "tags"
  | "defaultTestModel"
  | "orderingWeight"
  | "remark"
  | "clearRemark"
>

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

const editorCredentialStates = new WeakMap<
  AxonHubChannel,
  ResourceSecretState
>()
const editorCredentialReplacementBlockReasons = new WeakMap<
  AxonHubChannel,
  ResourceSecretReplacementBlockReason
>()

/** Returns whether AxonHub represents this channel with regular API-key credentials. */
export const isRegularAxonHubChannelType = (type: string): boolean =>
  REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(type)

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
    return new AxonHubNativeError(
      createControlledNativeFailure("unexpected"),
      error,
    )
  }

  const dispatch = error.dispatch === "dispatched" ? "after" : "before"
  return new AxonHubNativeError(
    createControlledNativeFailure(
      AXON_HUB_REQUEST_FAILURE_CODES[error.kind],
      dispatch,
    ),
    error,
  )
}

const channelMutationEffect = (
  kind: ManagedSiteMutationConfirmedEffect["kind"],
  resourceId: string,
): ManagedSiteMutationConfirmedEffect => ({
  kind,
  resourceKind: MANAGED_RESOURCE_KINDS.Channel,
  resourceId,
})

const mutationDiagnostic = (failure: AxonHubNativeFailure, error: unknown) => ({
  message: failure.code,
  code: failure.code,
  raw: error,
})

type AxonHubMutationStepResult<TData> =
  | { outcome: "applied"; data: TData }
  | {
      outcome: "rejected" | "uncertain"
      diagnostic: ManagedSiteMutationDiagnostic
    }

const isTypedAbort = (error: unknown): error is DOMException =>
  error instanceof DOMException && error.name === "AbortError"

const classifyMutationFailure = (
  error: unknown,
  bareAbortDispatch: AxonHubNativeFailure["dispatch"],
): { failure: AxonHubNativeFailure; error: unknown } => {
  if (
    error instanceof AxonHubNativeError &&
    isAxonHubNativeFailure(error.failure)
  ) {
    return { failure: error.failure, error }
  }
  if (error instanceof AxonHubRequestError) {
    return { failure: mapRequestFailure(error).failure, error }
  }
  if (isTypedAbort(error)) {
    return {
      failure: createControlledNativeFailure("aborted", bareAbortDispatch),
      error,
    }
  }
  throw error
}

const runAxonHubNativeMutationStep = async <TData>(input: {
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>
  effect: (data: TData) => ManagedSiteMutationConfirmedEffect
  execute(): Promise<TData>
  signal?: AbortSignal
  rejectResponse?: (data: TData) => AxonHubNativeError | undefined
  convergeFailure?: (
    failure: AxonHubNativeFailure,
  ) => { data: TData } | undefined
}): Promise<AxonHubMutationStepResult<TData>> => {
  const attempt = input.sequence.beginStep()
  if (input.signal?.aborted) {
    const error =
      input.signal.reason ??
      new DOMException("The operation was aborted", "AbortError")
    const failure = createControlledNativeFailure("aborted", "before")
    attempt.complete()
    return {
      outcome: "rejected",
      diagnostic: mutationDiagnostic(failure, error),
    }
  }
  try {
    const data = await input.execute()
    attempt.markPossiblyDispatched()
    attempt.markResponseReceived()
    const rejection = input.rejectResponse?.(data)
    if (rejection) {
      attempt.confirmNonApplication()
      attempt.complete()
      return {
        outcome: "rejected",
        diagnostic: mutationDiagnostic(rejection.failure, rejection),
      }
    }
    attempt.confirmEffect(input.effect(data))
    attempt.complete()
    return { outcome: "applied", data }
  } catch (error) {
    const classified = classifyMutationFailure(error, "after")
    if (classified.failure.dispatch === "after") {
      attempt.markPossiblyDispatched()
    }
    if (
      classified.failure.code === "not_found" &&
      classified.failure.dispatch === "after"
    ) {
      attempt.markResponseReceived()
      attempt.confirmNonApplication()
    }
    attempt.complete()
    const convergence = input.convergeFailure?.(classified.failure)
    if (convergence) {
      return { outcome: "applied", data: convergence.data }
    }
    return {
      outcome:
        classified.failure.dispatch === "before" ||
        classified.failure.code === "not_found"
          ? "rejected"
          : "uncertain",
      diagnostic: mutationDiagnostic(classified.failure, classified.error),
    }
  }
}

const finishAxonHubNativeMutation = <TData>(
  sequence: ManagedSiteMutationSequence<ManagedSiteMutationConfirmedEffect>,
  step: Exclude<AxonHubMutationStepResult<unknown>, { outcome: "applied" }>,
  data?: TData,
) =>
  sequence.finish({
    finalState: "unconfirmed",
    ...(data === undefined ? {} : { data }),
    diagnostic: step.diagnostic,
  })

const omitAxonHubChannelCredentials = (
  channel: AxonHubChannel,
): AxonHubChannel => {
  const credentialFreeChannel = { ...channel }
  delete credentialFreeChannel.credentials
  return credentialFreeChannel
}

const applyAxonHubNativeChannelPatch = (
  detail: AxonHubChannel,
  input: Omit<AxonHubNativeChannelPatch, "status">,
  receipt: AxonHubChannelMutationReceipt,
): AxonHubChannel => {
  const { clearAutoSyncModelPattern, clearRemark, ...changedValues } = input
  return {
    ...detail,
    ...changedValues,
    ...receipt,
    ...(clearAutoSyncModelPattern ? { autoSyncModelPattern: null } : {}),
    ...(clearRemark ? { remark: null } : {}),
  }
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
    loadSecret: async (ref, operationOptions) => {
      assertRef(ref)
      const detail = await callRead(() =>
        getAxonHubChannel(
          config,
          ref.resourceId,
          requestOptions(operationOptions),
        ),
      )
      const credential = getAxonHubCredentialKey(detail)
      if (!isRegularAxonHubChannelType(String(detail.type)) || !credential) {
        throw createNativeFailure("unavailable")
      }
      return credential
    },
    create: async (input, desiredStatus, operationOptions) => {
      const sequence = createManagedSiteMutationSequence({ idempotent: false })
      const createStep = await runAxonHubNativeMutationStep({
        sequence,
        signal: operationOptions?.signal,
        effect: (created) =>
          channelMutationEffect(
            MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
            created.id,
          ),
        execute: async () =>
          await createAxonHubChannel(
            config,
            input,
            requestOptions(operationOptions),
          ),
      })
      if (createStep.outcome !== "applied") {
        return finishAxonHubNativeMutation(sequence, createStep)
      }

      const created = omitAxonHubChannelCredentials({
        ...input,
        ...createStep.data,
      })
      if (desiredStatus !== AXON_HUB_CHANNEL_STATUS.ENABLED) {
        return sequence.finish({ finalState: "confirmed", data: created })
      }

      const statusStep = await runAxonHubNativeMutationStep({
        sequence,
        signal: operationOptions?.signal,
        effect: () =>
          channelMutationEffect(
            MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
            created.id,
          ),
        execute: async () =>
          await updateAxonHubChannelStatus(
            config,
            created.id,
            desiredStatus,
            requestOptions(operationOptions),
          ),
      })
      if (statusStep.outcome !== "applied") {
        return finishAxonHubNativeMutation(sequence, statusStep, created)
      }

      return sequence.finish({
        finalState: "confirmed",
        data: { ...created, status: desiredStatus },
      })
    },
    // AxonHub beta5 ignores status in UpdateChannel; status changes require
    // UpdateChannelStatus. Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/biz/channel.go
    update: async (detail, input, operationOptions) => {
      const { status, ...ordinaryInput } = input
      const statusChanged = status !== undefined && status !== detail.status
      const hasOrdinaryPatch = Object.keys(ordinaryInput).length > 0
      const sequence = createManagedSiteMutationSequence({ idempotent: true })
      let updated = detail

      if (hasOrdinaryPatch) {
        const updateStep = await runAxonHubNativeMutationStep({
          sequence,
          signal: operationOptions?.signal,
          effect: () =>
            channelMutationEffect(
              MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
              detail.id,
            ),
          execute: async () =>
            await updateAxonHubChannel(
              config,
              detail.id,
              ordinaryInput,
              requestOptions(operationOptions),
            ),
        })
        if (updateStep.outcome !== "applied") {
          return finishAxonHubNativeMutation(sequence, updateStep)
        }
        updated = applyAxonHubNativeChannelPatch(
          detail,
          ordinaryInput,
          updateStep.data,
        )
      }

      if (statusChanged) {
        const statusStep = await runAxonHubNativeMutationStep({
          sequence,
          signal: operationOptions?.signal,
          effect: () =>
            channelMutationEffect(
              MANAGED_SITE_MUTATION_EFFECT_KINDS.StatusUpdated,
              detail.id,
            ),
          execute: async () =>
            await updateAxonHubChannelStatus(
              config,
              detail.id,
              status,
              requestOptions(operationOptions),
            ),
        })
        if (statusStep.outcome !== "applied") {
          return finishAxonHubNativeMutation(
            sequence,
            statusStep,
            hasOrdinaryPatch ? updated : undefined,
          )
        }
      }

      return sequence.finish({
        finalState: "confirmed",
        data: statusChanged ? { ...updated, status } : updated,
      })
    },
    delete: async (ref, operationOptions) => {
      assertRef(ref)
      const sequence = createManagedSiteMutationSequence({ idempotent: true })
      const deleteStep = await runAxonHubNativeMutationStep({
        sequence,
        signal: operationOptions?.signal,
        effect: () =>
          channelMutationEffect(
            MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
            ref.resourceId,
          ),
        execute: async () =>
          await deleteAxonHubChannel(
            config,
            ref.resourceId,
            requestOptions(operationOptions),
          ),
        rejectResponse: (deleted) => {
          if (deleted) return undefined
          const failure = createControlledNativeFailure(
            "upstream_rejected",
            "after",
          )
          return new AxonHubNativeError(failure)
        },
        convergeFailure: (failure) =>
          failure.code === "not_found" ? { data: false } : undefined,
      })
      if (deleteStep.outcome !== "applied") {
        return finishAxonHubNativeMutation(sequence, deleteStep)
      }

      return sequence.finish({ finalState: "confirmed", data: undefined })
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
  ...(channel.manualModels ?? []),
  ...(channel.tags ?? []),
]

const toStatus = (status: string): ResourceDisplayFacts["status"] => {
  switch (status) {
    case AXON_HUB_CHANNEL_STATUS.ENABLED:
      return MANAGED_RESOURCE_STATUSES.Enabled
    case AXON_HUB_CHANNEL_STATUS.DISABLED:
      return MANAGED_RESOURCE_STATUSES.Disabled
    case AXON_HUB_CHANNEL_STATUS.ARCHIVED:
      return MANAGED_RESOURCE_STATUSES.Archived
    case MANAGED_RESOURCE_STATUSES.AutoDisabled:
      return MANAGED_RESOURCE_STATUSES.AutoDisabled
    default:
      return MANAGED_RESOURCE_STATUSES.Unknown
  }
}

export const getAxonHubCredentialCandidates = (
  channel: AxonHubChannel,
): string[] =>
  [...(channel.credentials?.apiKeys ?? []), channel.credentials?.apiKey]
    .filter((key): key is string => typeof key === "string")
    .map((key) => key.trim())
    .filter(Boolean)

const getCredentialReplacementBlockReason = (
  channel: AxonHubChannel,
): ResourceSecretReplacementBlockReason | undefined =>
  editorCredentialReplacementBlockReasons.get(channel) ??
  (getAxonHubCredentialCandidates(channel).length > 1
    ? MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS.MultipleCredentials
    : undefined)

const getCredentialState = (channel: AxonHubChannel): ResourceSecretState => {
  const editorState = editorCredentialStates.get(channel)
  if (editorState) return editorState
  if (channel.credentials === null)
    return MANAGED_RESOURCE_SECRET_STATES.PermissionHidden
  const keys = getAxonHubCredentialCandidates(channel)
  if (keys.some(hasUsableApiTokenKey))
    return MANAGED_RESOURCE_SECRET_STATES.Available
  if (keys.length) return MANAGED_RESOURCE_SECRET_STATES.Masked
  return MANAGED_RESOURCE_SECRET_STATES.Unavailable
}

const sanitizeAxonHubEditorDetail = (
  detail: AxonHubChannel,
): AxonHubChannel => {
  const credentialState = getCredentialState(detail)
  const credentialReplacementBlockReason =
    getCredentialReplacementBlockReason(detail)
  const sanitized: AxonHubChannel = {
    id: detail.id,
    name: detail.name,
    type: detail.type,
    status: detail.status,
    baseURL: detail.baseURL,
    credentials: undefined,
    supportedModels: detail.supportedModels,
    manualModels: detail.manualModels,
    autoSyncSupportedModels: detail.autoSyncSupportedModels,
    autoSyncModelPattern: detail.autoSyncModelPattern,
    tags: detail.tags,
    defaultTestModel: detail.defaultTestModel,
    orderingWeight: detail.orderingWeight,
    remark: detail.remark,
    settings: detail.settings
      ? { extraModelPrefix: detail.settings.extraModelPrefix }
      : undefined,
  }
  editorCredentialStates.set(sanitized, credentialState)
  if (credentialReplacementBlockReason) {
    editorCredentialReplacementBlockReasons.set(
      sanitized,
      credentialReplacementBlockReason,
    )
  }
  return sanitized
}

const getAxonHubCredentialKey = (channel: AxonHubChannel) => {
  if (
    getCredentialState(channel) !== MANAGED_RESOURCE_SECRET_STATES.Available ||
    getCredentialReplacementBlockReason(channel)
  ) {
    return undefined
  }
  return getAxonHubCredentialCandidates(channel).find(hasUsableApiTokenKey)
}

const canReplaceCredential = (channel: AxonHubChannel) =>
  isRegularAxonHubChannelType(String(channel.type)) &&
  getCredentialState(channel) !==
    MANAGED_RESOURCE_SECRET_STATES.PermissionHidden &&
  getCredentialReplacementBlockReason(channel) === undefined

const detailFacts = (
  channel: AxonHubChannel,
): readonly ResourceDisplayFact[] => [
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.name,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: String(channel.type),
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.baseURL ?? "",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: String(channel.status),
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
    state: getCredentialState(channel),
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
    value: channel.supportedModels ?? [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
    value: channel.manualModels ?? [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.defaultTestModel ?? "",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Boolean,
    value: channel.autoSyncSupportedModels ?? false,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.autoSyncModelPattern ?? "",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
    value: channel.tags ?? [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
    value: channel.orderingWeight ?? 0,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.remark ?? "",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.settings?.extraModelPrefix ?? "",
  },
]

const toFacts = (
  channel: AxonHubChannel,
  ref: ManagedResourceRef,
  fields: readonly ResourceDisplayFact[],
  searchValues?: readonly string[],
): ResourceDisplayFacts => {
  const status = toStatus(channel.status)
  const supportedState = status !== MANAGED_RESOURCE_STATUSES.Unknown
  return {
    ref,
    displayName: channel.name,
    status,
    fields,
    ...(searchValues?.length ? { searchValues } : {}),
    actions: { canUpdate: supportedState, canDelete: supportedState },
  }
}

const toListFacts = (channel: AxonHubChannel, ref: ManagedResourceRef) => {
  const selectedFieldIds = new Set(
    getAccountSiteDefinition(SITE_TYPES.AXON_HUB)?.managedResource
      ?.tableFieldIds ?? [],
  )
  const modelNames = Array.from(
    new Set(
      [...(channel.supportedModels ?? []), ...(channel.manualModels ?? [])]
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  )
  return toFacts(
    channel,
    ref,
    detailFacts(channel)
      .filter((fact) => selectedFieldIds.has(fact.fieldId))
      .map((fact) =>
        fact.fieldId === AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS
          ? ({
              fieldId: fact.fieldId,
              kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
              value: modelNames.length,
            } satisfies ResourceDisplayFact)
          : fact,
      ),
    modelNames,
  )
}

const readString = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  return typeof value === "string" ? value.trim() : ""
}

const readBoolean = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => values[fieldId] === true

const readNumber = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  if (typeof value === "number" && Number.isFinite(value)) return value
  return value === "" ? Number.NaN : 0
}

const readList = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

const readSecretIntent = (
  values: EditableResourceProjection,
): SecretEditIntent => {
  const value = values[AXON_HUB_CHANNEL_FIELD_IDS.KEY]
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "kind")
  ) {
    const candidate = value as Record<PropertyKey, unknown>
    if (candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged)
      return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
    if (candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear)
      return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear }
    if (
      candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      Object.prototype.hasOwnProperty.call(candidate, "value") &&
      typeof candidate.value === "string"
    ) {
      return {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: candidate.value,
      }
    }
  }
  return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
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

const AXON_HUB_MODEL_PATTERN_REGEX_CHARS = /[*?+[\]{}()^$.|\\]/
const AXON_HUB_INLINE_MODEL_PATTERN_MODIFIER = /^\(\?([a-z]+)\)/

// Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/utils/pattern.ts
const isValidAxonHubModelPattern = (pattern: string) => {
  if (!pattern || pattern === "*") return true

  const inlineModifier = pattern.match(AXON_HUB_INLINE_MODEL_PATTERN_MODIFIER)
  const modifiers = new Set(inlineModifier?.[1] ?? [])
  if ([...modifiers].some((modifier) => modifier !== "i")) return false

  const caseInsensitive = modifiers.has("i")
  const body = inlineModifier
    ? pattern.slice(inlineModifier[0].length)
    : pattern
  if (!AXON_HUB_MODEL_PATTERN_REGEX_CHARS.test(body)) return true

  const normalizedBody = body.replace(/^\^/, "").replace(/\$$/, "")
  try {
    new RegExp(`^(?:${normalizedBody})$`, caseInsensitive ? "i" : "")
    return true
  } catch {
    return false
  }
}

const validateValues = (
  values: EditableResourceProjection,
  context: {
    create: boolean
    detail?: AxonHubChannel
    baseline?: EditableResourceProjection
  },
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  const name = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.NAME)
  const type = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.TYPE)
  const baseURL = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL)
  const supportedModels = readList(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
  )
  const manualModels = readList(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
  )
  const defaultTestModel = readString(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
  )
  const autoSyncSupportedModels = readBoolean(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
  )
  const autoSyncModelPattern = readString(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
  ).trim()
  const secretIntent = readSecretIntent(values)
  const status = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.STATUS)
  const specialCredentialType = context.detail
    ? !REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(String(context.detail.type))
    : false
  const credentialMutationForbidden = context.detail
    ? !canReplaceCredential(context.detail)
    : false
  // beta5 disables model auto-sync for provider-managed credential types.
  // Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/components/channels-action-dialog.tsx
  const autoSyncSupported = isAxonHubModelAutoSyncSupported(type)
  const baseline = context.baseline
  const modelListInputsChanged = baseline
    ? [
        AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
        AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      ].some((fieldId) => fieldChanged(values, baseline, fieldId))
    : true
  const modelInputsChanged =
    modelListInputsChanged ||
    !baseline ||
    fieldChanged(
      values,
      baseline,
      AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    )

  if (!name) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (!type) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  } else if (
    (!specialCredentialType && !REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(type)) ||
    (specialCredentialType && type !== context.detail?.type)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (baseURL && !isHttpUrl(baseURL)) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (
    (context.create &&
      (secretIntent.kind !==
        MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace ||
        !secretIntent.value.trim())) ||
    secretIntent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear ||
    (secretIntent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      !secretIntent.value.trim()) ||
    (credentialMutationForbidden &&
      secretIntent.kind !== MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
      code: context.create
        ? MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required
        : MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (hasInvalidListValues(supportedModels)) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (modelInputsChanged && supportedModels.length === 0) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (hasInvalidListValues(manualModels)) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  // AxonHub beta5 keeps manual model provenance as a subset of supportedModels;
  // the native editor mirrors custom additions into both lists. Source:
  // https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/components/channels-action-dialog.tsx
  if (
    modelListInputsChanged &&
    normalizeList(manualModels).some(
      (model) => !new Set(normalizeList(supportedModels)).has(model),
    )
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InconsistentValue,
    })
  }
  if (modelInputsChanged && !defaultTestModel) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  } else if (
    modelInputsChanged &&
    defaultTestModel &&
    !new Set(normalizeList(supportedModels)).has(defaultTestModel)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InconsistentValue,
    })
  }
  if (
    !autoSyncSupported &&
    baseline &&
    (fieldChanged(
      values,
      baseline,
      AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    ) ||
      fieldChanged(
        values,
        baseline,
        AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
      ))
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (
    autoSyncSupported &&
    autoSyncSupportedModels &&
    !isValidAxonHubModelPattern(autoSyncModelPattern)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
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
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  const orderingWeight = values[AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT]
  if (!Number.isInteger(orderingWeight)) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  } else if (
    typeof orderingWeight === "number" &&
    (orderingWeight < 0 || orderingWeight > 100)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
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
  const secretState = detail
    ? getCredentialState(detail)
    : MANAGED_RESOURCE_SECRET_STATES.Unavailable
  const replacementBlockReason = detail
    ? getCredentialReplacementBlockReason(detail)
    : undefined
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
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: typeOptions,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: statusValues.map((value) => ({ value })),
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
      type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
      required: detail === undefined,
      secretState,
      canReplace: detail ? canReplaceCredential(detail) : true,
      ...(replacementBlockReason ? { replacementBlockReason } : {}),
      allowClear: false,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      required: true,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
      type: MANAGED_RESOURCE_FIELD_TYPES.Boolean,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      type: MANAGED_RESOURCE_FIELD_TYPES.Number,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
      type: MANAGED_RESOURCE_FIELD_TYPES.Textarea,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    },
  ].filter(
    ({ fieldId }) =>
      detail === undefined ||
      fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
  )
}

const createInitialValues = (): EditableResourceProjection => ({
  [AXON_HUB_CHANNEL_FIELD_IDS.NAME]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.STATUS]: AXON_HUB_CHANNEL_STATUS.DISABLED,
  [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
  },
  [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: [],
  [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: [],
  [AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]: false,
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.TAGS]: [],
  [AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT]: 0,
  [AXON_HUB_CHANNEL_FIELD_IDS.REMARK]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX]: "",
})

const createAxonHubChannelImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => {
  const models = normalizeList(seed.models)

  return {
    ...createInitialValues(),
    [AXON_HUB_CHANNEL_FIELD_IDS.NAME]: seed.name,
    [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: seed.channelType,
    [AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL]: seed.baseUrl,
    [AXON_HUB_CHANNEL_FIELD_IDS.STATUS]: seed.enabled
      ? AXON_HUB_CHANNEL_STATUS.ENABLED
      : AXON_HUB_CHANNEL_STATUS.DISABLED,
    [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: {
      kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
      value: seed.credential,
    },
    [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: models,
    [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: models,
    [AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]: models[0] ?? "",
    [AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT]: seed.orderingWeight,
  }
}

const editInitialValues = (
  detail: AxonHubChannel,
): EditableResourceProjection => ({
  [AXON_HUB_CHANNEL_FIELD_IDS.NAME]: detail.name,
  [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: String(detail.type),
  [AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL]: detail.baseURL ?? "",
  [AXON_HUB_CHANNEL_FIELD_IDS.STATUS]: String(detail.status),
  [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
  },
  [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: [
    ...(detail.supportedModels ?? []),
  ],
  [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: [...(detail.manualModels ?? [])],
  [AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]:
    detail.defaultTestModel ?? "",
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]:
    detail.autoSyncSupportedModels ?? false,
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN]:
    detail.autoSyncModelPattern ?? "",
  [AXON_HUB_CHANNEL_FIELD_IDS.TAGS]: [...(detail.tags ?? [])],
  [AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT]: detail.orderingWeight ?? 0,
  [AXON_HUB_CHANNEL_FIELD_IDS.REMARK]: detail.remark ?? "",
})

const buildCreateCommand = (
  values: EditableResourceProjection,
): AxonHubCreateCommand => {
  const baseURL = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL)
  const secret = readSecretIntent(values)
  const credential =
    secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
      ? secret.value.trim()
      : ""
  const extraModelPrefix = readString(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
  )
  return {
    desiredStatus:
      readString(values, AXON_HUB_CHANNEL_FIELD_IDS.STATUS) ===
      AXON_HUB_CHANNEL_STATUS.ENABLED
        ? AXON_HUB_CHANNEL_STATUS.ENABLED
        : AXON_HUB_CHANNEL_STATUS.DISABLED,
    input: {
      type: readString(values, AXON_HUB_CHANNEL_FIELD_IDS.TYPE),
      name: readString(values, AXON_HUB_CHANNEL_FIELD_IDS.NAME),
      ...(baseURL ? { baseURL } : {}),
      credentials: { apiKeys: [credential] },
      supportedModels: normalizeList(
        readList(values, AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS),
      ),
      manualModels: normalizeList(
        readList(values, AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS),
      ),
      autoSyncSupportedModels: readBoolean(
        values,
        AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
      ),
      autoSyncModelPattern:
        readString(
          values,
          AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
        ) || null,
      tags: normalizeList(readList(values, AXON_HUB_CHANNEL_FIELD_IDS.TAGS)),
      defaultTestModel: readString(
        values,
        AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
      ),
      settings: { extraModelPrefix },
      orderingWeight: readNumber(
        values,
        AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      ),
      remark: readString(values, AXON_HUB_CHANNEL_FIELD_IDS.REMARK) || null,
    },
  }
}

const arraysEqual = (first: readonly string[], second: readonly string[]) =>
  first.length === second.length &&
  first.every((value, index) => value === second[index])

const fieldChanged = (
  values: EditableResourceProjection,
  baseline: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  const initialValue = baseline[fieldId]
  if (Array.isArray(value) && Array.isArray(initialValue)) {
    return !arraysEqual(value, initialValue)
  }
  return value !== initialValue
}

const addNullableTextDiff = (
  input: AxonHubNativeChannelPatch,
  values: EditableResourceProjection,
  baseline: EditableResourceProjection,
  fieldId:
    | typeof AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN
    | typeof AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
  clearField: "clearAutoSyncModelPattern" | "clearRemark",
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
): AxonHubNativeChannelPatch => {
  const input: AxonHubNativeChannelPatch = {}
  const name = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.NAME)
  const type = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.TYPE)
  const status = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.STATUS)
  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.NAME)) {
    input.name = name
  }
  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.TYPE)) {
    input.type = type
  }
  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.STATUS)) {
    input.status = status
  }

  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL)) {
    // AxonHub beta8/beta9's custom updater ignores generated clearBaseURL but
    // applies a non-nil empty baseURL. Source: https://github.com/looplj/axonhub/blob/v1.0.0-beta9/internal/server/biz/channel.go
    input.baseURL = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL)
  }
  addNullableTextDiff(
    input,
    values,
    baseline,
    AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
    "clearAutoSyncModelPattern",
  )
  addNullableTextDiff(
    input,
    values,
    baseline,
    AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
    "clearRemark",
  )

  const secret = readSecretIntent(values)
  if (
    secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
    canReplaceCredential(detail)
  ) {
    input.credentials = { apiKeys: [secret.value.trim()] }
  }

  const supportedModels = normalizeList(
    readList(values, AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS),
  )
  if (
    fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS)
  ) {
    input.supportedModels = supportedModels
  }
  const manualModels = normalizeList(
    readList(values, AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS),
  )
  if (
    fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS)
  ) {
    // The same updater accepts [] but ignores generated clearManualModels.
    input.manualModels = manualModels
  }
  const tags = normalizeList(readList(values, AXON_HUB_CHANNEL_FIELD_IDS.TAGS))
  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.TAGS)) {
    // AxonHub's custom update service applies non-nil tags (including []) but
    // ignores generated clearTags: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/biz/channel.go#L680-L692
    input.tags = tags
  }

  const defaultTestModel = readString(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
  )
  if (
    fieldChanged(
      values,
      baseline,
      AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    )
  ) {
    input.defaultTestModel = defaultTestModel
  }
  const autoSyncSupportedModels = readBoolean(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
  )
  if (
    fieldChanged(
      values,
      baseline,
      AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    )
  ) {
    input.autoSyncSupportedModels = autoSyncSupportedModels
  }
  const orderingWeight = readNumber(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
  )
  if (
    fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT)
  ) {
    input.orderingWeight = orderingWeight
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
  loadSecret?: NativeResourceEditorDefinition<AxonHubNativeChannelPatch>["loadSecret"],
): NativeResourceEditorDefinition<AxonHubNativeChannelPatch> => {
  const initialValues = editInitialValues(detail)
  return {
    fields: createFieldDescriptors(detail),
    initialValues,
    validate: (values) =>
      validateValues(values, {
        create: false,
        detail,
        baseline: initialValues,
      }),
    buildCommand: (values) => buildUpdateCommand(detail, initialValues, values),
    ...(loadSecret ? { loadSecret } : {}),
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
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: createAxonHubChannelImportProjection,
    },
  ],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
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
  toMutationFacts: toListFacts,
  createEditor: async () => createEditor(),
  editEditor: (
    operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
  ) => {
    const resourceId = detail.id
    const loadSecret =
      getCredentialState(detail) === MANAGED_RESOURCE_SECRET_STATES.Available &&
      canReplaceCredential(detail)
        ? (fieldId: string, options?: ResourceOperationOptions) => {
            if (fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.KEY) {
              throw createNativeFailure("unexpected")
            }
            return operations.loadSecret(
              {
                siteType: SITE_TYPES.AXON_HUB,
                kind: MANAGED_RESOURCE_KINDS.Channel,
                scopeKey: operations.scopeKey,
                resourceId,
              },
              options,
            )
          }
        : undefined
    return editEditor(detail, loadSecret)
  },
  sanitizeEditDetail: sanitizeAxonHubEditorDetail,
  create: (
    operations: AxonHubNativeResourceOperations,
    command: AxonHubCreateCommand,
    options?: ResourceOperationOptions,
  ) => operations.create(command.input, command.desiredStatus, options),
  update: (
    operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
    command: AxonHubNativeChannelPatch,
    options?: ResourceOperationOptions,
  ) => {
    // UpdateChannelInput.credentials.apiKeys is replacement data, so a scalar
    // editor must not overwrite multiple keys in the authoritative detail.
    // Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/ent.graphql#L5993
    if (
      command.credentials !== undefined &&
      getCredentialReplacementBlockReason(detail) ===
        MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS.MultipleCredentials
    ) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
        fieldIssues: [
          {
            fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
            code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
          },
        ],
      })
    }
    return operations.update(detail, command, options)
  },
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
