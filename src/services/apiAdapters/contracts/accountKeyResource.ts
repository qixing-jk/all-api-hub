import type { AccountSiteType } from "~/constants/siteType"
import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import type {
  EditableResourceProjection,
  NativeResourceMutationResult,
  ResourceDisplayFact,
  ResourceFailure,
  ResourceFieldDescriptor,
  ResourceFieldOption,
  ResourceListQuery,
  ResourceOperationOptions,
  ResourceValidationResult,
} from "./resourceNative"

export {
  RESOURCE_FAILURE_CODES as ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  RESOURCE_FIELD_ISSUE_CODES as ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES,
} from "./resourceNative"
export type {
  EditableResourceProjection,
  ResourceDisplayFact,
  ResourceFailure,
  ResourceFieldDescriptor,
  ResourceFieldIssue,
  ResourceFieldOption,
  ResourceListQuery,
  ResourceOperationOptions,
  ResourceValidationResult,
} from "./resourceNative"

export type AccountKeyResourceRef = {
  readonly accountId: string
  readonly siteType: AccountSiteType
  readonly scopeKey: string
  readonly resourceId: string
}

export type AccountKeyScope = {
  readonly scopeKey: string
  readonly routeKey: string
  readonly displayName: string
  readonly isDefault: boolean
  readonly secondaryLabel?: string
}

export type AccountKeyScopeInventory = {
  readonly scopes: readonly AccountKeyScope[]
  readonly partialFailure?: ResourceFailure
}

export const ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS = {
  Requirement: "requirement",
  Orphaned: "orphaned",
  Unmanaged: "unmanaged",
  Unknown: "unknown",
} as const

export const ACCOUNT_KEY_PROVISIONING_COVERAGE = {
  Usable: "usable",
  Unusable: "unusable",
  Unknown: "unknown",
} as const

export const ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS = {
  InheritedAccountGroupUnavailable: "inherited-account-group-unavailable",
} as const

export const ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS = {
  Automatic: "automatic",
  InputRequired: "input-required",
} as const

export type AccountKeyRequirementProvisioning =
  | {
      readonly kind: typeof ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic
    }
  | {
      readonly kind: typeof ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired
      readonly reasonCode: string
    }

export type AccountKeyProvisioningRequirement = {
  /** Provider-owned opaque identity; callers must not derive it from displayName. */
  readonly requirementKey: string
  /** Disclosure-only label that must never be passed back as protocol identity. */
  readonly displayName: string
  /** Declares whether reconciliation may dispatch the provider-native default write. */
  readonly provisioning: AccountKeyRequirementProvisioning
}

export type AccountKeyProvisioningPlacement =
  | {
      readonly kind: typeof ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement
      /** Non-empty, de-duplicated provider-owned requirement identities. */
      readonly requirementKeys: readonly string[]
    }
  | {
      readonly kind: typeof ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned
      readonly placementKey: string
      readonly displayName?: string
    }
  | {
      readonly kind:
        | typeof ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unmanaged
        | typeof ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown
      readonly reasonCode?: (typeof ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS)[keyof typeof ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS]
    }

export type AccountKeyProvisioningInventoryItem = {
  readonly ref: AccountKeyResourceRef
  /** Provider-owned key name used only for user-facing presentation. */
  readonly displayName?: string
  readonly placement: AccountKeyProvisioningPlacement
  /** Machine coverage state supplied by the Adapter, never inferred from display facts. */
  readonly coverage: (typeof ACCOUNT_KEY_PROVISIONING_COVERAGE)[keyof typeof ACCOUNT_KEY_PROVISIONING_COVERAGE]
  /** Provider-owned rename intent; orchestration never derives it from display facts. */
  readonly renameSuggestion?: {
    readonly targetDisplayName: string
  }
}

export type AccountKeyProvisioningSnapshot = {
  readonly requirements: readonly AccountKeyProvisioningRequirement[]
  readonly items: readonly AccountKeyProvisioningInventoryItem[]
  readonly partialFailure?: ResourceFailure
}

export type AccountKeyProvisionedResource = {
  readonly ref: AccountKeyResourceRef
  readonly createdSecret?: CreatedRuntimeSecret
}

export interface AccountKeyProvisioningSession {
  inspect(
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyProvisioningSnapshot>
  provision(
    requirementKey: string,
    options?: ResourceOperationOptions,
  ): Promise<
    NativeResourceMutationResult<AccountKeyProvisionedResource, ResourceFailure>
  >
  rename?(
    ref: AccountKeyResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<NativeResourceMutationResult<void, ResourceFailure>>
}

export const ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS = {
  Resolved: "resolved",
  Unavailable: "unavailable",
} as const

export type AccountRuntimeKeyResolution =
  | {
      readonly kind: typeof ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved
      readonly secret: string
    }
  | {
      readonly kind: typeof ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable
      readonly failure?: ResourceFailure
    }

export interface AccountKeyRuntimeKeySession {
  resolve(
    ref: AccountKeyResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<AccountRuntimeKeyResolution>
}

export type AccountKeyResourceFacts = {
  readonly ref: AccountKeyResourceRef
  readonly displayName: string
  readonly maskedLabel: string
  readonly status: "enabled" | "disabled" | "expired" | "unknown"
  readonly fields: readonly ResourceDisplayFact[]
  readonly searchValues?: readonly string[]
  readonly actions: Readonly<{ canUpdate: boolean; canDelete: boolean }>
}

export type AccountKeyEditorSubmitResult = {
  readonly facts: AccountKeyResourceFacts
  readonly createdSecret?: CreatedRuntimeSecret
}

export type AccountKeyResourcePage = {
  items: readonly AccountKeyResourceFacts[]
  total?: number
  nextCursor?: string
}

export class AccountKeyResourceError extends Error {
  constructor(readonly failure: ResourceFailure) {
    super(failure.message?.trim() || failure.code)
    this.name = "AccountKeyResourceError"
  }
}

export interface AccountKeyResourceEditor {
  readonly fields: readonly ResourceFieldDescriptor[]
  readonly initialValues: EditableResourceProjection
  validate(values: EditableResourceProjection): ResourceValidationResult
  /** Resolves the validated scope that a submitted command targets. */
  resolveDestinationScopeKey(values: EditableResourceProjection): string
  loadOptions?: (
    fieldId: string,
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => Promise<readonly ResourceFieldOption[]>
  submit(
    values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyEditorSubmitResult>
}

export interface AccountKeyResourceCollection {
  readonly scope: AccountKeyScope
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourcePage>
  get(
    ref: AccountKeyResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceFacts>
  openEditEditor(
    ref: AccountKeyResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceEditor>
  delete(
    ref: AccountKeyResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<void>
}

export interface AccountKeyResourceSession {
  readonly provisioning?: AccountKeyProvisioningSession
  readonly runtimeKey?: AccountKeyRuntimeKeySession
  resolveDefaultScope(
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyScope>
  listScopes(
    options?: ResourceOperationOptions,
  ): Promise<readonly AccountKeyScope[]>
  /** Returns usable scopes together with any non-blocking inventory failure. */
  listScopeInventory?(
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyScopeInventory>
  /** Re-runs only the read-only scope inventory operation. */
  refreshScopeInventory?(
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyScopeInventory>
  openCollection(
    scopeKey: string,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceCollection>
  openCreateEditor(
    scopeKey: string,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceEditor>
}

export type AccountKeyResourceOpenInput = {
  account: {
    id: string
    name?: string
    siteType: AccountSiteType
  }
  request: ApiServiceRequest
}

export interface AccountKeyResourceCapability {
  open(
    input: AccountKeyResourceOpenInput,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceSession>
}
