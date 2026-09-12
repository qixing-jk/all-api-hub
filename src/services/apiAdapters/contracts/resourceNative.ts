export const RESOURCE_FIELD_TYPES = {
  Text: "text",
  Textarea: "textarea",
  Number: "number",
  Boolean: "boolean",
  Select: "select",
  MultiSelect: "multi-select",
  Secret: "secret",
  SecretList: "secret-list",
  DateTime: "date-time",
} as const

export const RESOURCE_FIELD_OPTION_LOAD_TRIGGERS = {
  Automatic: "automatic",
  Manual: "manual",
} as const

export const RESOURCE_SECRET_STATES = {
  Available: "available",
  Masked: "masked",
  Unavailable: "unavailable",
  PermissionHidden: "permission-hidden",
} as const

export const RESOURCE_SECRET_EDIT_INTENT_KINDS = {
  Unchanged: "unchanged",
  Replace: "replace",
  Clear: "clear",
} as const

export const RESOURCE_DISPLAY_FACT_KINDS = {
  Text: "text",
  Number: "number",
  Boolean: "boolean",
  List: "list",
  Secret: "secret",
} as const

export const RESOURCE_FAILURE_CODES = {
  ConfigurationRequired: "configuration_required",
  InvalidConfiguration: "invalid_configuration",
  AuthenticationFailed: "authentication_failed",
  PermissionDenied: "permission_denied",
  ValidationFailed: "validation_failed",
  ResourceChanged: "resource_changed",
  NotFound: "not_found",
  MutationStateUncertain: "mutation_state_uncertain",
  Unavailable: "unavailable",
  UpstreamRejected: "upstream_rejected",
  Aborted: "aborted",
  Unexpected: "unexpected",
} as const

export const RESOURCE_FAILURE_RECOVERY_HINTS = {
  InteractiveVerification: "interactive_verification",
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
  (typeof RESOURCE_SECRET_STATES)[keyof typeof RESOURCE_SECRET_STATES]

export type ResourceDisplayFact =
  | {
      fieldId: string
      kind: typeof RESOURCE_DISPLAY_FACT_KINDS.Text
      value: string
    }
  | {
      fieldId: string
      kind: typeof RESOURCE_DISPLAY_FACT_KINDS.Number
      value: number
    }
  | {
      fieldId: string
      kind: typeof RESOURCE_DISPLAY_FACT_KINDS.Boolean
      value: boolean
    }
  | {
      fieldId: string
      kind: typeof RESOURCE_DISPLAY_FACT_KINDS.List
      value: readonly string[]
    }
  | {
      fieldId: string
      kind: typeof RESOURCE_DISPLAY_FACT_KINDS.Secret
      state: ResourceSecretState
    }

export type SecretEditIntent =
  | { kind: typeof RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
  | { kind: typeof RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace; value: string }
  | { kind: typeof RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear }

export type ResourceFieldValue =
  | null
  | string
  | number
  | boolean
  | readonly string[]
  | SecretEditIntent
  | ResourceSecretListValue

/** Editor-local row identities preserve saved credentials without exposing their values. */
export type ResourceSecretListEntry = {
  id: string
  secret: SecretEditIntent
  fields: Readonly<Record<string, string>>
}

export type ResourceSecretListValue = {
  kind: "secret-list"
  entries: readonly ResourceSecretListEntry[]
}

/** The adapter decides which saved rows can be revealed and which attributes are editable. */
export type ResourceSecretListDescriptor = ResourceFieldDescriptorBase & {
  type: "secret-list"
  minEntries?: number
  savedEntries: readonly {
    id: string
    secretState: ResourceSecretState
    /** Opaque target accepted by the editor's existing loadSecret operation. */
    loadFieldId?: string
  }[]
  entryFields: readonly {
    fieldId: string
    type: "text" | "number" | "boolean"
    min?: number
    max?: number
  }[]
}

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

type ResourceFieldOptionLoadTrigger =
  (typeof RESOURCE_FIELD_OPTION_LOAD_TRIGGERS)[keyof typeof RESOURCE_FIELD_OPTION_LOAD_TRIGGERS]

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
  optionLoader?: {
    dependsOn: readonly string[]
    /** Manual loading is useful when dependencies include credentials or remote probes. */
    trigger?: ResourceFieldOptionLoadTrigger
  }
}

export type ResourceFieldDescriptor =
  | ResourceSecretListDescriptor
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
      /** Whether this provider can reveal the saved secret on demand. */
      canLoadSecret?: boolean
      canReplace: boolean
      replacementBlockReason?: ResourceSecretReplacementBlockReason
      allowClear: boolean
    })

export type ResourceFailure = {
  code: (typeof RESOURCE_FAILURE_CODES)[keyof typeof RESOURCE_FAILURE_CODES]
  recoveryHint?: (typeof RESOURCE_FAILURE_RECOVERY_HINTS)[keyof typeof RESOURCE_FAILURE_RECOVERY_HINTS]
  /** Resource identity required to resume an interactive verification. */
  recoveryResourceId?: string
  /** Adapter-sanitized diagnostic safe for the affected user's private UI. */
  message?: string
  /** Adapter-sanitized upstream identifier safe for the affected user's private UI. */
  upstreamCode?: string
  fieldIssues?: readonly ResourceFieldIssue[]
}

export type NativeResourceMutationResult<T, TFailure> =
  | { certainty: "applied"; value: T }
  | { certainty: "not-applied"; failure: TFailure }
  | { certainty: "possibly-applied"; failure: TFailure }
  | { certainty: "partially-applied"; failure: TFailure }
