import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  type AxonHubChannelStatus,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_STATUSES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
  type ResourceFailure,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  axonCredentialRecords,
  createAxonHubChannelImportProjection,
  getAxonHubCredentialCandidates,
  getAxonHubCredentialKey,
  getCredentialState,
  isRegularAxonHubChannelType,
  sanitizeAxonHubEditorDetail,
  type AxonHubCreateCommand,
  type AxonHubNativeChannelPatch,
} from "~/services/apiAdapters/managedResources/axonHubEditorProjection"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
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
} from "~/types/axonHub"
import type { AxonHubConfig } from "~/types/axonHubConfig"

import {
  createAxonHubCreateProjection,
  createAxonHubEditProjection,
  validateAxonHubCreateProjection,
} from "./axonHubEditorProjection"
import { resolveCredentialPatch } from "./credentialListEditor"

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
    keyCleanupBaseUrls: [channel.baseURL ?? ""],
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
      validate: (values: EditableResourceProjection) =>
        validateAxonHubCreateProjection(values),
      sourceFieldIds: {
        [AXON_HUB_CHANNEL_FIELD_IDS.NAME]: "name",
        [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: "channelType",
        [AXON_HUB_CHANNEL_FIELD_IDS.STATUS]: "enabled",
        [AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL]: "baseUrl",
        [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: "credential",
        [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: "models",
        [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: "models",
        [AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]: "models",
      } as const,
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
  createEditor: async () => createAxonHubCreateProjection(),
  editEditor: (
    operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
  ) => {
    const ref = {
      siteType: SITE_TYPES.AXON_HUB,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: operations.scopeKey,
      resourceId: detail.id,
    }
    return createAxonHubEditProjection(detail, {
      loadSecret: (fieldId, options) => {
        if (fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.KEY)
          throw createNativeFailure("unexpected")
        return operations.loadSecret(ref, options)
      },
      reloadDetail: (options) => operations.get(ref, options),
    })
  },
  sanitizeEditDetail: sanitizeAxonHubEditorDetail,
  keyCleanup: async (
    operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
  ) => {
    if (!isRegularAxonHubChannelType(String(detail.type)))
      throw new ManagedResourceError({ code: "unavailable" })
    const keys = getAxonHubCredentialCandidates(detail)
    if (!keys.length) throw new ManagedResourceError({ code: "unavailable" })
    return {
      baseUrls: [detail.baseURL ?? ""],
      keys,
      // AxonHub's apiKeys input replaces the complete credential list.
      remove: async (
        indices: readonly number[],
        options?: ResourceOperationOptions,
      ) => {
        const latest = await operations.get(
          {
            siteType: SITE_TYPES.AXON_HUB,
            kind: MANAGED_RESOURCE_KINDS.Channel,
            scopeKey: operations.scopeKey,
            resourceId: detail.id,
          },
          options,
        )
        if (
          JSON.stringify(getAxonHubCredentialCandidates(latest)) !==
          JSON.stringify(keys)
        )
          throw new ManagedResourceError({ code: "resource_changed" })
        return operations.update(
          latest,
          {
            credentials: {
              ...latest.credentials,
              apiKey: undefined,
              apiKeys: keys.filter((_, index) => !indices.includes(index)),
            },
          },
          options,
        )
      },
    }
  },
  create: async (
    operations: AxonHubNativeResourceOperations,
    command: AxonHubCreateCommand,
    options?: ResourceOperationOptions,
  ) => {
    if (command.credentialPatch)
      command.input.credentials = {
        apiKeys: (
          await resolveCredentialPatch(command.credentialPatch, [])
        ).map(({ key }) => key),
      }
    return operations.create(command.input, command.desiredStatus, options)
  },
  update: async (
    operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
    command: AxonHubNativeChannelPatch,
    options?: ResourceOperationOptions,
  ) => {
    const { credentialPatch, ...patch } = command
    // AxonHub replaces apiKeys as a whole; reject stale membership before writing.
    // https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/ent.graphql
    if (credentialPatch) {
      if (
        !isRegularAxonHubChannelType(String(detail.type)) ||
        detail.credentials == null
      )
        throw new ManagedResourceError({ code: "permission_denied" })
      patch.credentials = {
        ...detail.credentials,
        apiKey: undefined,
        apiKeys: (
          await resolveCredentialPatch(
            credentialPatch,
            axonCredentialRecords(detail),
          )
        ).map(({ key }) => key),
      }
    } else if (
      patch.credentials &&
      getAxonHubCredentialCandidates(detail).length > 1
    ) {
      throw new ManagedResourceError({ code: "resource_changed" })
    }
    return operations.update(detail, patch, options)
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
