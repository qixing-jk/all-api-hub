import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import {
  type EditableResourceProjection,
  type ResourceDisplayFact,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldOption,
  type ResourceListQuery,
  type ResourceOperationOptions,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/resourceNative"
import type { ManagedSiteMutationResult } from "~/services/managedSites/mutations"

export {
  RESOURCE_DISPLAY_FACT_KINDS as MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  RESOURCE_FAILURE_CODES as MANAGED_RESOURCE_FAILURE_CODES,
  RESOURCE_FAILURE_RECOVERY_HINTS as MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS,
  RESOURCE_FIELD_ISSUE_CODES as MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_OPTION_LOAD_TRIGGERS as MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  RESOURCE_FIELD_TYPES as MANAGED_RESOURCE_FIELD_TYPES,
  RESOURCE_SECRET_EDIT_INTENT_KINDS as MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS as MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
  RESOURCE_SECRET_STATES as MANAGED_RESOURCE_SECRET_STATES,
} from "~/services/apiAdapters/contracts/resourceNative"
export type {
  EditableResourceProjection,
  ResourceDisplayFact,
  ResourceFailure,
  ResourceFieldDescriptor,
  ResourceFieldIssue,
  ResourceFieldOption,
  ResourceFieldValue,
  ResourceListQuery,
  ResourceOperationOptions,
  ResourceSecretReplacementBlockReason,
  ResourceSecretState,
  ResourceValidationResult,
  SecretEditIntent,
} from "~/services/apiAdapters/contracts/resourceNative"

export type ManagedResourceRef = {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  scopeKey: string
  resourceId: string
}

/** Validates an untrusted public resource ref before any adapter capability access. */
export const isManagedResourceRef = (
  value: unknown,
): value is ManagedResourceRef => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.siteType === "string" &&
    typeof candidate.kind === "string" &&
    typeof candidate.scopeKey === "string" &&
    candidate.scopeKey.length > 0 &&
    candidate.scopeKey.length <= 2048 &&
    typeof candidate.resourceId === "string" &&
    candidate.resourceId.length > 0 &&
    candidate.resourceId.length <= 512
  )
}

/** Validates a public ref against the operation-owned identity and optional scope. */
export const isManagedResourceRefFor = (
  value: unknown,
  expected: Pick<ManagedResourceRef, "siteType" | "kind"> & {
    scopeKey?: string
  },
): value is ManagedResourceRef =>
  isManagedResourceRef(value) &&
  value.siteType === expected.siteType &&
  value.kind === expected.kind &&
  (expected.scopeKey === undefined || value.scopeKey === expected.scopeKey)

export const MANAGED_RESOURCE_STATUSES = {
  Enabled: "enabled",
  Disabled: "disabled",
  ManuallyDisabled: "manually-disabled",
  Archived: "archived",
  AutoDisabled: "auto-disabled",
  Unknown: "unknown",
} as const

export type ResourceDisplayFacts = {
  ref: ManagedResourceRef
  displayName: string
  status: (typeof MANAGED_RESOURCE_STATUSES)[keyof typeof MANAGED_RESOURCE_STATUSES]
  fields: readonly ResourceDisplayFact[]
  /** Safe, non-rendered values used by the shared local search index. */
  searchValues?: readonly string[]
  actions: {
    canUpdate: boolean
    canDelete: boolean
    /** Safe channel identity facts used by optional product-owned actions. */
    channel?: ManagedResourceChannelActionFacts
  }
}

export type ManagedResourceChannelActionFacts = {
  channelId: number
  channelType: string | number
  canSyncModels: boolean
  canOpenModelSync: boolean
  canConfigureModelFilters: boolean
}

export type ResourcePage = {
  items: readonly ResourceDisplayFacts[]
  total?: number
  nextCursor?: string
}

export const MANAGED_RESOURCE_CREATE_SEED_KINDS = {
  ManagedChannelImport: "managed-channel-import",
} as const

export type ManagedResourceCreateSeedKind =
  (typeof MANAGED_RESOURCE_CREATE_SEED_KINDS)[keyof typeof MANAGED_RESOURCE_CREATE_SEED_KINDS]

/** Provider-neutral source data for creating a managed channel from an import. */
export type ManagedChannelImportCreateSeed = {
  kind: typeof MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport
  name: string
  channelType: string
  credential: string
  baseUrl: string
  enabled: boolean
  models: readonly string[]
  orderingWeight: number
  priority: number
  notes: string
}

export type ManagedResourceCreateSeed = ManagedChannelImportCreateSeed

export type ResourceCreateEditorOptions = ResourceOperationOptions & {
  seed?: ManagedResourceCreateSeed
}

export class ManagedResourceError extends Error {
  constructor(
    readonly failure: ResourceFailure,
    options?: { privateMessage?: string },
  ) {
    super(options?.privateMessage ?? (failure.message?.trim() || failure.code))
    this.name = "ManagedResourceError"
  }
}

export interface ResourceEditor {
  readonly fields: readonly ResourceFieldDescriptor[]
  readonly initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  /** Optionally loads a saved secret into the editor's field-local input state. */
  loadSecret?: (
    fieldId: string,
    options?: ResourceOperationOptions,
  ) => Promise<string>
  /** Loads provider-owned options without coupling the shared editor to a protocol. */
  loadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
  submit(
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ResourceDisplayFacts>>
}

export interface ManagedResourceWorkspace {
  readonly capabilities: {
    canSearch: boolean
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
  }
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<ResourcePage>
  get(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ResourceDisplayFacts>
  openCreateEditor(
    options?: ResourceCreateEditorOptions,
  ): Promise<ResourceEditor>
  openEditEditor(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ResourceEditor>
  delete(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
}

export interface ManagedResourceRegistration {
  readonly siteType: ManagedSiteType
  readonly kind: ManagedResourceKind
  readonly createSeedKinds?: readonly ManagedResourceCreateSeedKind[]
  open(options?: ResourceOperationOptions): Promise<ManagedResourceWorkspace>
}
