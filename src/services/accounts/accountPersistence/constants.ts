import type { AccountInfo } from "~/types"

export const ACCOUNT_SAVE_FEEDBACK_LEVELS = {
  Success: "success",
  Warning: "warning",
} as const

export const ACCOUNT_PERSISTENCE_LOG_STATUSES = {
  Fetching: "fetching",
  Fallback: "fallback",
  LoadFailed: "load_failed",
  NotFound: "not_found",
  PersistFailed: "persist_failed",
  Rejected: "rejected",
  SavedBeforeDeferredRefresh: "saved_before_deferred_refresh",
  SavedWithRefresh: "saved_with_refresh",
  SavedWithoutDataRefresh: "saved_without_data_refresh",
  UpdatedBeforeDeferredRefresh: "updated_before_deferred_refresh",
  UpdatedWithRefresh: "updated_with_refresh",
} as const

export const EMPTY_ACCOUNT_INFO_METRICS = {
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_quota_consumption: 0,
  today_requests_count: 0,
  today_income: 0,
} as const satisfies Pick<
  AccountInfo,
  | "today_prompt_tokens"
  | "today_completion_tokens"
  | "today_quota_consumption"
  | "today_requests_count"
  | "today_income"
>
