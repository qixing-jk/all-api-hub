export const RESOURCE_FIELD_TYPES = {
  Text: "text",
  Textarea: "textarea",
  Number: "number",
  Boolean: "boolean",
  Select: "select",
  MultiSelect: "multi-select",
  Secret: "secret",
  DateTime: "date-time",
} as const

export const RESOURCE_FAILURE_CODES = {
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

export const RESOURCE_FIELD_ISSUE_CODES = {
  Required: "required",
  InvalidValue: "invalid_value",
  OutOfRange: "out_of_range",
  UnsupportedOption: "unsupported_option",
  InconsistentValue: "inconsistent_value",
} as const

export const RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS = {
  MultipleCredentials: "multiple_credentials",
} as const

export type ResourceSecretReplacementBlockReason =
  (typeof RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS)[keyof typeof RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS]

export type ResourceOperationOptions = { signal?: AbortSignal }

export type ResourceListQuery = {
  cursor?: string
  limit?: number
  search?: string
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

export type SecretEditIntent =
  | { kind: "unchanged" }
  | { kind: "replace"; value: string }
  | { kind: "clear" }

export type ResourceFieldValue =
  | null
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
  code: (typeof RESOURCE_FIELD_ISSUE_CODES)[keyof typeof RESOURCE_FIELD_ISSUE_CODES]
}

export type ResourceValidationResult =
  | { valid: true }
  | { valid: false; issues: readonly ResourceFieldIssue[] }

export type ResourceFieldOption = {
  value: string
  displayLabel?: string
  secondaryLabel?: string
}

export type ResourceFieldDescriptorBase = {
  fieldId: string
  required?: boolean
  nullable?: boolean
  readOnly?: boolean
}

type ResourceSelectFieldDescriptor = ResourceFieldDescriptorBase & {
  type:
    | (typeof RESOURCE_FIELD_TYPES)["Select"]
    | (typeof RESOURCE_FIELD_TYPES)["MultiSelect"]
  options: readonly ResourceFieldOption[]
  optionLoader?: { dependsOn: readonly string[] }
}

export type ResourceFieldDescriptor =
  | (ResourceFieldDescriptorBase & {
      type:
        | (typeof RESOURCE_FIELD_TYPES)["Text"]
        | (typeof RESOURCE_FIELD_TYPES)["Textarea"]
        | (typeof RESOURCE_FIELD_TYPES)["DateTime"]
    })
  | (ResourceFieldDescriptorBase & {
      type: (typeof RESOURCE_FIELD_TYPES)["Number"]
      min?: number
      max?: number
      step?: number
    })
  | (ResourceFieldDescriptorBase & {
      type: (typeof RESOURCE_FIELD_TYPES)["Boolean"]
    })
  | ResourceSelectFieldDescriptor
  | (ResourceFieldDescriptorBase & {
      type: (typeof RESOURCE_FIELD_TYPES)["Secret"]
      secretState: ResourceSecretState
      canReplace: boolean
      replacementBlockReason?: ResourceSecretReplacementBlockReason
      allowClear: boolean
    })

export type ResourceFailure = {
  code: (typeof RESOURCE_FAILURE_CODES)[keyof typeof RESOURCE_FAILURE_CODES]
  message?: string
  upstreamCode?: string
  fieldIssues?: readonly ResourceFieldIssue[]
}

export type NativeResourceMutationResult<T, TFailure> =
  | { certainty: "applied"; value: T }
  | { certainty: "not-applied"; failure: TFailure }
  | { certainty: "possibly-applied"; failure: TFailure }
  | { certainty: "partially-applied"; failure: TFailure }
