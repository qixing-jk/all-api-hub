import type { ManagedSiteType } from "~/constants/siteType"

export const MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS = {
  Channel: "channel",
  Provider: "provider",
  Outbound: "outbound",
  Unknown: "unknown",
} as const

export type ManagedUpstreamResourceNativeKind =
  (typeof MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS)[keyof typeof MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS]

export const MANAGED_UPSTREAM_RESOURCE_STATUSES = {
  Enabled: "enabled",
  Disabled: "disabled",
  AutoDisabled: "auto_disabled",
  Unknown: "unknown",
} as const

export type ManagedUpstreamResourceStatus =
  (typeof MANAGED_UPSTREAM_RESOURCE_STATUSES)[keyof typeof MANAGED_UPSTREAM_RESOURCE_STATUSES]

export const MANAGED_UPSTREAM_RESOURCE_SECRET_STATES = {
  Available: "available",
  Masked: "masked",
  Unavailable: "unavailable",
  Unsupported: "unsupported",
} as const

export type ManagedUpstreamResourceSecretState =
  (typeof MANAGED_UPSTREAM_RESOURCE_SECRET_STATES)[keyof typeof MANAGED_UPSTREAM_RESOURCE_SECRET_STATES]

export type ManagedUpstreamResourceRef = {
  managedSiteType: ManagedSiteType
  /**
   * Stable non-secret scope identity, such as a normalized admin origin.
   * Do not include credential-bearing URLs, tokens, or other secrets.
   */
  scopeKey: string
  /**
   * Stable non-secret native resource identity, such as an internal id.
   * Do not include credential-bearing URLs, tokens, or other secrets.
   */
  resourceId: string
}

type ManagedUpstreamResourceRefInput = Omit<
  ManagedUpstreamResourceRef,
  "resourceId"
> & {
  resourceId: string | number
}

export type ManagedUpstreamResourceCapabilitySet = {
  canCreate?: boolean
  canUpdate?: boolean
  canDelete?: boolean
  canRevealSecret?: boolean
}

export type ManagedUpstreamResourceSummary = {
  ref: ManagedUpstreamResourceRef
  displayName: string
  nativeKind: ManagedUpstreamResourceNativeKind
  status: ManagedUpstreamResourceStatus
  typeLabel?: string
  endpointLabel?: string
  modelCount?: number
  modelPreview?: string[]
  secretState: ManagedUpstreamResourceSecretState
  capabilities: ManagedUpstreamResourceCapabilitySet
}

export type ManagedUpstreamResourceDetail<TNative = unknown> = {
  summary: ManagedUpstreamResourceSummary
  native: TNative
}

export const MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES = {
  Text: "text",
  Textarea: "textarea",
  Number: "number",
  Boolean: "boolean",
  Select: "select",
  MultiSelect: "multi_select",
  Secret: "secret",
  Json: "json",
} as const

export type ManagedUpstreamResourceFieldType =
  (typeof MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES)[keyof typeof MANAGED_UPSTREAM_RESOURCE_FIELD_TYPES]

export type ManagedUpstreamResourceFieldOption = {
  label: string
  value: string
  description?: string
}

export type ManagedUpstreamResourceFieldDescriptor = {
  name: string
  label: string
  type: ManagedUpstreamResourceFieldType
  required?: boolean
  description?: string
  placeholder?: string
  options?: ManagedUpstreamResourceFieldOption[]
  secretState?: ManagedUpstreamResourceSecretState
}

export type ManagedUpstreamResourceFieldContext<TNative = unknown> = {
  mode: "create" | "edit"
  detail?: ManagedUpstreamResourceDetail<TNative>
}

export type ManagedUpstreamResourceDraftValidationIssue = {
  field?: string
  message: string
}

export type ManagedUpstreamResourceDraftValidationResult = {
  valid: boolean
  errors: ManagedUpstreamResourceDraftValidationIssue[]
}

export type ManagedUpstreamResourceSecretResult =
  | {
      status: "available"
      secret: string
    }
  | {
      status: "masked" | "unavailable" | "unsupported"
      message?: string
    }

/**
 * Builds a resource ref while preserving the public contract that resource ids are strings.
 */
export function createManagedUpstreamResourceRef(
  input: ManagedUpstreamResourceRefInput,
): ManagedUpstreamResourceRef {
  return {
    managedSiteType: input.managedSiteType,
    scopeKey: input.scopeKey,
    resourceId: String(input.resourceId),
  }
}

/**
 * Derives a stable key from non-secret resource identity fields.
 */
export function getManagedUpstreamResourceRefKey(
  ref: ManagedUpstreamResourceRef,
): string {
  return [
    ref.managedSiteType,
    encodeURIComponent(ref.scopeKey),
    encodeURIComponent(ref.resourceId),
  ].join(":")
}
