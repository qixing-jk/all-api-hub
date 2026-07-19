export const MANAGED_SITE_MODEL_SYNC_ACTIONS = {
  RUN_ALL: "run_all",
  RUN_SELECTED_HISTORY: "run_selected_history",
  RUN_SELECTED_MANUAL: "run_selected_manual",
  RETRY_FAILED: "retry_failed",
} as const

export type ManagedSiteModelSyncAction =
  (typeof MANAGED_SITE_MODEL_SYNC_ACTIONS)[keyof typeof MANAGED_SITE_MODEL_SYNC_ACTIONS]
