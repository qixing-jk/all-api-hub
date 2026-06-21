import {
  TOKEN_PROVISIONING_ERRORS,
  type TokenProvisioningBlockReason,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiToken } from "~/types"

export const DEFAULT_TOKEN_INVENTORY_STATE_KINDS = {
  Missing: "missing",
  Present: "present",
} as const

export type DefaultTokenInventoryState =
  | {
      kind: typeof DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Missing
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present
      token: ApiToken
      existingTokenIds: number[]
      hasUsableSecret: boolean
    }

export const DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS = {
  Ready: "ready",
  Created: "created",
  SelectionRequired: "selection_required",
  Blocked: "blocked",
} as const

export const DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS = {
  MissingUserGroups: "missing_user_groups",
  CreateTokenFailed: TOKEN_PROVISIONING_ERRORS.CreateTokenFailed,
  TokenNotFound: TOKEN_PROVISIONING_ERRORS.TokenNotFound,
  AmbiguousCreatedToken: "ambiguous_created_token",
} as const

export type DefaultTokenLifecycleBlockReason =
  | TokenProvisioningBlockReason
  | (typeof DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS)[keyof typeof DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS]

export type DefaultTokenLifecycleResult =
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready
      token: ApiToken
      created: false
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created
      token: ApiToken
      created: true
      oneTimeSecret: boolean
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired
      allowedGroups: string[]
      existingTokenIds: number[]
    }
  | {
      kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked
      reason: DefaultTokenLifecycleBlockReason
      existingTokenIds: number[]
      cause?: unknown
    }

export const DEFAULT_TOKEN_LIFECYCLE_ERRORS = {
  QuickCreateSelectionIsDecisionOnly: "quick_create_selection_is_decision_only",
  PolicyBlocked: "default_token_lifecycle_policy_blocked",
} as const

export class DefaultTokenLifecyclePolicyBlockedError extends Error {
  readonly code = DEFAULT_TOKEN_LIFECYCLE_ERRORS.PolicyBlocked
  readonly reason: DefaultTokenLifecycleBlockReason

  constructor(params: {
    reason: DefaultTokenLifecycleBlockReason
    message: string
  }) {
    super(params.message)
    this.name = "DefaultTokenLifecyclePolicyBlockedError"
    this.reason = params.reason
  }
}
