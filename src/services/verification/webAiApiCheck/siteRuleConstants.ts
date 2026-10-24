/** Persisted rule values shared by preferences, matching and rule editors. */
export const WEB_AI_API_CHECK_RULE_SYNTAX = {
  WILDCARD: "wildcard",
  EXACT: "exact",
  REGEX: "regex",
  LEGACY: "legacy",
} as const

export const WEB_AI_API_CHECK_RULE_LIST = {
  WHITELIST: "whitelist",
  BLACKLIST: "blacklist",
} as const

export const WEB_AI_API_CHECK_SITE_ACCESS_MODE = {
  ALL: "all",
  INCLUDE: "include",
  REGEX: "regex",
} as const

export const WEB_AI_API_CHECK_RULE_MUTATION = {
  PRIORITY: "priority",
  ADD: "add",
  REMOVE: "remove",
  EDIT: "edit",
} as const

export const WEB_AI_API_CHECK_SITE_DECISION = {
  UNSUPPORTED: "unsupported",
  WHITELIST_PRIORITY: "whitelist-priority",
  BLACKLIST_PRIORITY: "blacklist-priority",
  WHITELIST: "whitelist",
  BLACKLIST: "blacklist",
  UNLISTED: "unlisted",
  DEFAULT: "default",
} as const
