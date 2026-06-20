import type {
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/apiService/common/type"
import type { ApiToken } from "~/types"
import type { AccountKeyRepairSkipReason } from "~/types/accountKeyAutoProvisioning"

export const TOKEN_PROVISIONING_WORKFLOWS = {
  BackgroundAutoProvision: "background_auto_provision",
  SharedEnsure: "shared_ensure",
  QuickCreateSelection: "quick_create_selection",
  PostSaveAutomation: "post_save_automation",
  Repair: "repair",
} as const

export type TokenProvisioningWorkflow =
  (typeof TOKEN_PROVISIONING_WORKFLOWS)[keyof typeof TOKEN_PROVISIONING_WORKFLOWS]

export const TOKEN_PROVISIONING_BLOCK_REASONS = {
  GroupRequired: "group_required",
  AvailableGroupRequired: "available_group_required",
  GroupSelectionRequired: "group_selection_required",
  OneTimeSecretRequired: "one_time_secret_required",
  CreateFailed: "create_failed",
  CreatedTokenSecretUnavailable: "created_token_secret_unavailable",
} as const

export type TokenProvisioningBlockReason =
  (typeof TOKEN_PROVISIONING_BLOCK_REASONS)[keyof typeof TOKEN_PROVISIONING_BLOCK_REASONS]

export type ResolveDefaultTokenCreationRequest = {
  workflow: TokenProvisioningWorkflow
  defaultTokenData: CreateTokenRequest
  explicitGroup?: string
  userGroups?: Record<string, UserGroupInfo>
}

export const TOKEN_CREATION_SECRET_RECOVERY = {
  InventoryRefetch: "inventory_refetch",
  CreatedResponseFirst: "created_response_first",
} as const

export type TokenCreationSecretRecovery =
  (typeof TOKEN_CREATION_SECRET_RECOVERY)[keyof typeof TOKEN_CREATION_SECRET_RECOVERY]

export const TOKEN_PROVISIONING_ERRORS = {
  CreateTokenFailed: "create_token_failed",
  Sub2ApiGroupInventoryNotImplemented:
    "sub2api_group_inventory_not_implemented",
  Sub2ApiQuickCreateNotApplicable: "sub2api_quick_create_not_applicable",
  TokenNotFound: "token_not_found",
} as const

export const DEFAULT_TOKEN_CREATION_DECISION_KINDS = {
  Create: "create",
  NeedsUserGroups: "needs_user_groups",
  SelectionRequired: "selection_required",
  Blocked: "blocked",
} as const

export type DefaultTokenCreationDecision =
  | {
      kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create
      tokenData: CreateTokenRequest
      oneTimeSecret: boolean
      recoverCreatedToken: TokenCreationSecretRecovery
    }
  | {
      kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups
    }
  | {
      kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired
      allowedGroups: string[]
      reason: typeof TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired
    }
  | {
      kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked
      reason: TokenProvisioningBlockReason
    }

export type CreatedTokenSecretDecision =
  | {
      kind: "usable"
      token: ApiToken
      oneTimeSecret: boolean
    }
  | {
      kind: "failed"
      reason: typeof TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed
    }
  | {
      kind: "unavailable"
      reason: typeof TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable
    }
  | {
      kind: "needs_inventory_refetch"
    }

export type TokenProvisioningRepairSkipReason = Extract<
  AccountKeyRepairSkipReason,
  "sub2api" | "aihubmixOneTimeKey"
>

export const TOKEN_PROVISIONING_REPAIR_POLICY_KINDS = {
  Eligible: "eligible",
  Skipped: "skipped",
} as const

export type TokenProvisioningRepairPolicy =
  | {
      kind: typeof TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible
    }
  | {
      kind: typeof TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped
      skipReason: TokenProvisioningRepairSkipReason
    }

export type TokenProvisioningCapability = {
  isInventoryTokenUsable(params: {
    workflow: TokenProvisioningWorkflow
    token: ApiToken
  }): boolean
  resolveDefaultTokenCreation(
    request: ResolveDefaultTokenCreationRequest,
  ): DefaultTokenCreationDecision
  classifyCreatedToken(params: {
    workflow: TokenProvisioningWorkflow
    result: CreateTokenResult
  }): CreatedTokenSecretDecision
  getRepairPolicy(): TokenProvisioningRepairPolicy
}

export const isCreatedApiToken = (value: unknown): value is ApiToken =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Partial<ApiToken>).id === "number" &&
  typeof (value as Partial<ApiToken>).key === "string"
