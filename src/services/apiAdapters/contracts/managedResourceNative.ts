import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"

export const MANAGED_RESOURCE_FIELD_TYPES = {
  Text: "text",
  Textarea: "textarea",
  Number: "number",
  Boolean: "boolean",
  Select: "select",
  MultiSelect: "multi-select",
  Secret: "secret",
} as const

export const MANAGED_RESOURCE_FAILURE_CODES = {
  ConfigurationRequired: "configuration_required",
  InvalidConfiguration: "invalid_configuration",
  AuthenticationFailed: "authentication_failed",
  PermissionDenied: "permission_denied",
  ValidationFailed: "validation_failed",
  NotFound: "not_found",
  MutationStateUncertain: "mutation_state_uncertain",
  Unavailable: "unavailable",
  UpstreamRejected: "upstream_rejected",
  Aborted: "aborted",
  Unexpected: "unexpected",
} as const

export const MANAGED_RESOURCE_FIELD_ISSUE_CODES = {
  Required: "required",
  InvalidValue: "invalid_value",
  OutOfRange: "out_of_range",
  UnsupportedOption: "unsupported_option",
  InconsistentValue: "inconsistent_value",
} as const

export type ManagedResourceRef = {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  scopeKey: string
  resourceId: string
}

export type ResourceOperationOptions = { signal?: AbortSignal }

export type ResourceListQuery = {
  cursor?: string
  limit?: number
  search?: string
}

export type ResourceDisplayFacts = {
  ref: ManagedResourceRef
  displayName: string
  status: "enabled" | "disabled" | "archived" | "auto-disabled" | "unknown"
  fields: readonly ResourceDisplayFact[]
  actions: { canUpdate: boolean; canDelete: boolean }
}

export type ResourceSecretState =
  | "available"
  | "masked"
  | "unavailable"
  | "permission-hidden"

export type ResourceDisplayFact =
  | { fieldId: string; kind: "text"; value: string }
  | { fieldId: string; kind: "number"; value: number }
  | { fieldId: string; kind: "boolean"; value: boolean }
  | { fieldId: string; kind: "list"; value: readonly string[] }
  | { fieldId: string; kind: "secret"; state: ResourceSecretState }

export type ResourcePage = {
  items: readonly ResourceDisplayFacts[]
  total?: number
  nextCursor?: string
}

export type SecretEditIntent =
  | { kind: "unchanged" }
  | { kind: "replace"; value: string }
  | { kind: "clear" }

export type ResourceFieldValue =
  | string
  | number
  | boolean
  | readonly string[]
  | SecretEditIntent

export type EditableResourceProjection = Readonly<
  Record<string, ResourceFieldValue>
>

export type ResourceFieldIssue = {
  fieldId: string
  code: (typeof MANAGED_RESOURCE_FIELD_ISSUE_CODES)[keyof typeof MANAGED_RESOURCE_FIELD_ISSUE_CODES]
}

export type ResourceValidationResult =
  | { valid: true }
  | { valid: false; issues: readonly ResourceFieldIssue[] }

type ResourceFieldDescriptorBase = {
  fieldId: string
  required?: boolean
}

export type ResourceFieldDescriptor =
  | (ResourceFieldDescriptorBase & { type: "text" })
  | (ResourceFieldDescriptorBase & { type: "textarea"; rows?: number })
  | (ResourceFieldDescriptorBase & {
      type: "number"
      min?: number
      max?: number
      step?: number
    })
  | (ResourceFieldDescriptorBase & { type: "boolean" })
  | (ResourceFieldDescriptorBase & {
      type: "select"
      options: readonly { value: string }[]
    })
  | (ResourceFieldDescriptorBase & {
      type: "multi-select"
      options: readonly { value: string }[]
    })
  | (ResourceFieldDescriptorBase & {
      type: "secret"
      secretState: ResourceSecretState
      allowClear: boolean
    })

export type ResourceFailure = {
  code: (typeof MANAGED_RESOURCE_FAILURE_CODES)[keyof typeof MANAGED_RESOURCE_FAILURE_CODES]
  fieldIssues?: readonly ResourceFieldIssue[]
}

export class ManagedResourceError extends Error {
  constructor(readonly failure: ResourceFailure) {
    super(failure.code)
    this.name = "ManagedResourceError"
  }
}

export interface ResourceEditor {
  readonly fields: readonly ResourceFieldDescriptor[]
  readonly initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  submit(
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ): Promise<ResourceDisplayFacts>
}

export interface ManagedResourceWorkspace {
  readonly supportsSearch: boolean
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<ResourcePage>
  get(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ResourceDisplayFacts>
  openCreateEditor(options?: ResourceOperationOptions): Promise<ResourceEditor>
  openEditEditor(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<ResourceEditor>
  delete(
    ref: ManagedResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<void>
}

export interface ManagedResourceRegistration {
  readonly siteType: ManagedSiteType
  readonly kind: ManagedResourceKind
  open(options?: ResourceOperationOptions): Promise<ManagedResourceWorkspace>
}
