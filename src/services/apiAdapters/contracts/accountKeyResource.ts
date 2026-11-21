import type { AccountSiteType } from "~/constants/siteType"
import type { AccountCredentialIdentity } from "~/services/accounts/keys/accountCredentialIdentity"
import type { CreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import type { AccountRuntimeKeyModelAccess } from "~/services/accounts/keys/runtimeKeyModelAccess"
import type { KeyMaskEvidence } from "~/services/accountTokens/keyMaskEvidence"
import type { BalancePosition, EvidenceRef } from "~/services/amounts/balance"
import type { BudgetConstraint } from "~/services/amounts/budgets"
import { type BUDGET_AMOUNT_FIELDS } from "~/services/amounts/financialConstants"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import type { InventorySecretAvailability } from "./inventorySecret"
import { NATIVE_RESOURCE_MUTATION_CERTAINTIES } from "./resourceNative"
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

export const ACCOUNT_KEY_FINANCIAL_FACT_KINDS = {
  BudgetConstraint: "budget-constraint",
  Allocation: "allocation",
} as const

export const ACCOUNT_KEY_DISPLAY_FACT_KINDS = {
  ...ACCOUNT_KEY_FINANCIAL_FACT_KINDS,
  RateLimit: "rate-limit",
  Expiry: "expiry",
  LastUsed: "last-used",
  Restriction: "restriction",
  Permission: "permission",
  Channels: "channels",
  Group: "group",
  Attribution: "attribution",
} as const

export const ACCOUNT_KEY_RESTRICTION_ROLES = {
  Models: "models",
  Tools: "tools",
  Ip: "ip",
  Subnet: "subnet",
} as const

export const ACCOUNT_KEY_PERMISSION_ROLES = { Manage: "manage" } as const
export const ACCOUNT_KEY_EXPIRY_STATES = { Never: "never" } as const

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

/** Product intent; each adapter chooses the native fields that can satisfy it. */
export type AccountKeyCreationIntent = {
  readonly nameHint?: string
  readonly preferredGroup?: string
  readonly allowedGroups?: readonly string[]
  readonly modelContext?: {
    readonly modelId: string
  }
}

export const ACCOUNT_KEY_DEFAULT_CREATION_POLICIES = {
  EditorDefaults: "editor-defaults",
  SelectRequirement: "select-requirement",
  RequiresInput: "requires-input",
} as const
export type AccountKeyDefaultCreationPolicy =
  (typeof ACCOUNT_KEY_DEFAULT_CREATION_POLICIES)[keyof typeof ACCOUNT_KEY_DEFAULT_CREATION_POLICIES]

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

export const ACCOUNT_KEY_REQUIREMENT_PROVISIONING_REASONS = {
  FiniteQuotaRequired: "finite-quota-required",
} as const

export type AccountKeyRequirementProvisioning =
  | {
      readonly kind: typeof ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic
    }
  | {
      readonly kind: typeof ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired
      readonly reasonCode: (typeof ACCOUNT_KEY_REQUIREMENT_PROVISIONING_REASONS)[keyof typeof ACCOUNT_KEY_REQUIREMENT_PROVISIONING_REASONS]
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
  /** Only a complete empty inventory may enter the adapter's default creation workflow. */
  readonly emptyRequirementsAction?: "default-creation"
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

export const ACCOUNT_KEY_GROUP_EMPTY_VALUES = {
  AccountGroup: "account-group",
  Ungrouped: "ungrouped",
} as const

export type AccountKeyGroupEmptyValue =
  (typeof ACCOUNT_KEY_GROUP_EMPTY_VALUES)[keyof typeof ACCOUNT_KEY_GROUP_EMPTY_VALUES]

/** Adapter-owned financial facts retain their assets, sources and scopes; timestamps are milliseconds. */
export type AccountKeyDisplayFact =
  | {
      readonly fieldId: string
      readonly kind: typeof ACCOUNT_KEY_FINANCIAL_FACT_KINDS.BudgetConstraint
      readonly budget: BudgetConstraint
      readonly metric?: (typeof BUDGET_AMOUNT_FIELDS)[keyof typeof BUDGET_AMOUNT_FIELDS]
    }
  | {
      readonly fieldId: string
      readonly kind: typeof ACCOUNT_KEY_FINANCIAL_FACT_KINDS.Allocation
      readonly position: BalancePosition
      readonly parent: Pick<
        BalancePosition,
        "id" | "scope" | "collectionKey"
      > & { source: EvidenceRef }
    }
  | {
      readonly fieldId: string
      readonly kind: typeof ACCOUNT_KEY_DISPLAY_FACT_KINDS.RateLimit
      readonly rpm: number
      readonly concurrency: number
    }
  | {
      readonly fieldId: string
      readonly kind: typeof ACCOUNT_KEY_DISPLAY_FACT_KINDS.Expiry
      readonly timestampMs:
        number | typeof ACCOUNT_KEY_EXPIRY_STATES.Never | null
    }
  | {
      readonly fieldId: string
      readonly kind: typeof ACCOUNT_KEY_DISPLAY_FACT_KINDS.LastUsed
      readonly timestampMs: number
    }
  | {
      readonly fieldId: string
      readonly kind: typeof ACCOUNT_KEY_DISPLAY_FACT_KINDS.Restriction
      readonly role:
        | typeof ACCOUNT_KEY_RESTRICTION_ROLES.Models
        | typeof ACCOUNT_KEY_RESTRICTION_ROLES.Tools
        | typeof ACCOUNT_KEY_RESTRICTION_ROLES.Ip
        | typeof ACCOUNT_KEY_RESTRICTION_ROLES.Subnet
      readonly value: string | readonly string[]
    }
  | {
      readonly fieldId: string
      /** Key capability, not a restriction on models, networks or groups. */
      readonly kind: typeof ACCOUNT_KEY_DISPLAY_FACT_KINDS.Permission
      readonly role: typeof ACCOUNT_KEY_PERMISSION_ROLES.Manage
      readonly granted: boolean
    }
  | {
      readonly fieldId: string
      /** Billing-route permissions, independent of account/model access groups. */
      readonly kind: typeof ACCOUNT_KEY_DISPLAY_FACT_KINDS.Channels
      readonly value: readonly string[]
      readonly usesDefault: boolean
    }
  | {
      readonly fieldId: string
      readonly kind: typeof ACCOUNT_KEY_DISPLAY_FACT_KINDS.Group
      readonly value: string | readonly string[]
      /** The provider decides whether an empty group inherits the account group. */
      readonly emptyValue: AccountKeyGroupEmptyValue
    }
  | {
      readonly fieldId: string
      /** Billing attribution target; independent of account/model access groups. */
      readonly kind: typeof ACCOUNT_KEY_DISPLAY_FACT_KINDS.Attribution
      /** Provider-declared attribution key, resolved through the provider's copy. */
      readonly value: string
    }

export const ACCOUNT_KEY_RESOURCE_STATUSES = {
  Enabled: "enabled",
  Disabled: "disabled",
  Expired: "expired",
  Unknown: "unknown",
} as const

export type AccountKeyResourceStatus =
  (typeof ACCOUNT_KEY_RESOURCE_STATUSES)[keyof typeof ACCOUNT_KEY_RESOURCE_STATUSES]

export const ACCOUNT_KEY_DETAIL_AVAILABILITIES = {
  Complete: "complete",
} as const

export type AccountKeyResourceFacts = {
  /** Complete inventory facts can be disclosed locally; omitted means detail may need a read. */
  readonly detailAvailability?: (typeof ACCOUNT_KEY_DETAIL_AVAILABILITIES)[keyof typeof ACCOUNT_KEY_DETAIL_AVAILABILITIES]

  readonly ref: AccountKeyResourceRef
  readonly displayName: string
  readonly maskedLabel: string
  readonly status: AccountKeyResourceStatus
  /** Provider evidence; local linked plaintext is reconciled only for presentation. */
  readonly accountCredentialIdentity?: AccountCredentialIdentity
  /** Verified inventory plaintext for the current snapshot only; never persist as display metadata. */
  readonly runtimeSecret?: string
  /** Provider-confirmed inventory evidence; never derive this from maskedLabel. */
  readonly keyMask?: KeyMaskEvidence
  /** Safe machine policy projected by the provider, never parsed from display fields. */
  readonly runtimeKey?: {
    readonly modelAccess: AccountRuntimeKeyModelAccess
    /**
     * Whether the provider treats this key as an inference credential.
     *
     * Omitted when the provider has no such distinction; false excludes the
     * key from default selection and export even though it may still answer
     * completions requests.
     */
    readonly inference?: boolean
    /** Canonical Unix epoch milliseconds. */
    readonly createdAt?: number
    readonly notes?: string
    /**
     * Client-facing address this key is used with, when the provider routes by
     * credential rather than by the account origin.
     */
    readonly baseUrl?: string
    /** Compatibility for existing associations and exported provider identities. */
    readonly legacyTokenId?: number
  }
  readonly fields: readonly ResourceDisplayFact[]
  /** Provider-owned presentation semantics; raw fields are never evidence of these meanings. */
  readonly displayFacts?: readonly AccountKeyDisplayFact[]
  readonly searchValues?: readonly string[]
  readonly actions: Readonly<{
    canUpdate: boolean
    canDelete: boolean
    /** Permanently invalidates the credential while retaining its record. */
    canRevoke?: boolean
    canRotate?: boolean
    canEnable?: boolean
    canDisable?: boolean
  }>
}

export type AccountKeyEditorSubmitResult = {
  /** Metadata facts are complete; background name sync must not block resource actions. */
  readonly refreshPolicy?: typeof ACCOUNT_KEY_RESOURCE_LOCAL_METADATA
  /** Null only for confirmed creation with a response-only secret and no attributable ID. */
  readonly facts: AccountKeyResourceFacts | null
  readonly createdSecret?: CreatedRuntimeSecret
}

export type AccountKeyResourcePage = {
  items: readonly AccountKeyResourceFacts[]
  total?: number
  nextCursor?: string
}

export const ACCOUNT_KEY_MUTATION_CERTAINTIES = {
  NotApplied: NATIVE_RESOURCE_MUTATION_CERTAINTIES.NotApplied,
  PossiblyApplied: NATIVE_RESOURCE_MUTATION_CERTAINTIES.PossiblyApplied,
} as const

export type AccountKeyMutationCertainty =
  (typeof ACCOUNT_KEY_MUTATION_CERTAINTIES)[keyof typeof ACCOUNT_KEY_MUTATION_CERTAINTIES]

export class AccountKeyResourceError extends Error {
  constructor(
    readonly failure: ResourceFailure,
    /** Only explicit mutation evidence may authorize a retry after submit. */
    readonly mutationCertainty?: AccountKeyMutationCertainty,
  ) {
    super(failure.message?.trim() || failure.code)
    this.name = "AccountKeyResourceError"
  }
}

export interface AccountKeyResourceEditor {
  readonly action?: AccountKeyResourceEditAction
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

export const ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS = {
  Rotate: "rotate",
  Enable: "enable",
  Disable: "disable",
  Rename: "rename",
  Allocate: "allocate",
  Return: "return",
} as const
export type AccountKeyResourceEditAction =
  (typeof ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS)[keyof typeof ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS]

/** Local metadata commits preserve the accepted inventory without a server refresh. */
export const ACCOUNT_KEY_RESOURCE_LOCAL_METADATA = "local-metadata"
export type AccountKeyResourceEditIntent = {
  /** Providers with separate edit actions can select one explicitly. */
  action?: AccountKeyResourceEditAction
  /** Accepted inventory facts can supply metadata; writable server fields are read fresh. */
  snapshot?: AccountKeyResourceFacts
}

export interface AccountKeyResourceCollection {
  /** Irreversibly disables a credential while retaining its inventory record. */
  revoke?(
    ref: AccountKeyResourceRef,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceFacts>
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
    intent?: AccountKeyResourceEditIntent,
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
    intent?: AccountKeyCreationIntent,
    /** Provider-owned placement identity for a missing provisioning requirement. */
    provisioningRequirementKey?: string,
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
  /** Credential-scoped native operations; omitted providers support all three. */
  readonly operations?: (auth: ApiServiceRequest["auth"]) => {
    create: boolean
    update: boolean
    delete: boolean
  }
  /** Declares whether an inventory item can yield a complete runtime secret. */
  readonly inventorySecretAvailability?: InventorySecretAvailability
  /** The adapter decides whether its defaults are safe to submit without a form. */
  readonly defaultCreation?: AccountKeyDefaultCreationPolicy
  open(
    input: AccountKeyResourceOpenInput,
    options?: ResourceOperationOptions,
  ): Promise<AccountKeyResourceSession>
}
