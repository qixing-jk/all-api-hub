import type { ApiToken } from "~/types"

export const ACCOUNT_POST_SAVE_WORKFLOW_STEPS = {
  Idle: "idle",
  SavingAccount: "saving_account",
  LoadingSavedAccount: "loading_saved_account",
  CheckingToken: "checking_token",
  CreatingToken: "creating_token",
  WaitingForOneTimeKeyAcknowledgement:
    "waiting_for_one_time_key_acknowledgement",
  WaitingForSub2ApiGroupSelection: "waiting_for_sub2api_group_selection",
  OpeningManagedSiteDialog: "opening_managed_site_dialog",
  Completed: "completed",
  Failed: "failed",
} as const

export type AccountPostSaveWorkflowStep =
  (typeof ACCOUNT_POST_SAVE_WORKFLOW_STEPS)[keyof typeof ACCOUNT_POST_SAVE_WORKFLOW_STEPS]

export const ENSURE_ACCOUNT_TOKEN_RESULT_KINDS = {
  Ready: "ready",
  Created: "created",
  Sub2ApiSelectionRequired: "sub2api_selection_required",
  Blocked: "blocked",
} as const

export const ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES = {
  SavedAccountNotFound: "saved_account_not_found",
  TokenCreationFailed: "token_creation_failed",
  TokenSecretUnavailable: "token_secret_unavailable",
  ManagedSiteConfigMissing: "managed_site_config_missing",
  UserCancelled: "user_cancelled",
} as const

export type AccountPostSaveWorkflowErrorCode =
  (typeof ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES)[keyof typeof ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES]

export type EnsureAccountTokenResult =
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready
      token: ApiToken
      created: false
    }
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created
      token: ApiToken
      created: true
      oneTimeSecret: boolean
    }
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired
      allowedGroups: string[]
      existingTokenIds: number[]
    }
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked
      code: AccountPostSaveWorkflowErrorCode
      message: string
    }
