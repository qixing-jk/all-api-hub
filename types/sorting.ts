// Enum for sorting criteria identifiers
export enum SortingCriteriaType {
  CURRENT_SITE = "current_site",
  HEALTH_STATUS = "health_status",
  CHECK_IN_REQUIREMENT = "check_in_requirement",
  CUSTOM_CHECK_IN_URL = "custom_check_in_url",
  CUSTOM_REDEEM_URL = "custom_redeem_url",
  MATCHED_OPEN_TABS = "matched_open_tabs",
  USER_SORT_FIELD = "user_sort_field"
}

// Interface for sorting field configuration.
// This contains only the data required for sorting logic.
export interface SortingFieldConfig {
  id: SortingCriteriaType
  enabled: boolean
  priority: number // 0-3, lower = higher priority
}

// Complete sorting configuration
export interface SortingPriorityConfig {
  version?: number // For future migrations (defaults to 0 if undefined)
  criteria: SortingFieldConfig[]
  lastModified: number // Timestamp
}
