export const ACCOUNT_POST_SAVE_WORKFLOW_STEPS = {
  Idle: "idle",
  SavingAccount: "saving_account",
  LoadingSavedAccount: "loading_saved_account",
  CheckingToken: "checking_token",
  CreatingToken: "creating_token",
  WaitingForOneTimeKeyAcknowledgement:
    "waiting_for_one_time_key_acknowledgement",
  WaitingForKeyInput: "waiting_for_key_input",
  OpeningManagedSiteDialog: "opening_managed_site_dialog",
  Completed: "completed",
  Failed: "failed",
} as const

export type AccountPostSaveWorkflowStep =
  (typeof ACCOUNT_POST_SAVE_WORKFLOW_STEPS)[keyof typeof ACCOUNT_POST_SAVE_WORKFLOW_STEPS]
