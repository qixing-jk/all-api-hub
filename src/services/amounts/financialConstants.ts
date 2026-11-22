/** Stable runtime values for the shared financial contracts. */
export const FINANCIAL_ACCOUNT_EXCLUSION_REASONS = {
  Disabled: "disabled",
  Settings: "settings",
  NoBalance: "no-balance",
  NoUsableData: "no-usable-data",
  Duplicate: "duplicate",
  Conflict: "conflict",
} as const

export const ASSET_KINDS = {
  Currency: "currency",
  Quota: "quota",
  Crypto: "crypto",
  Unknown: "unknown",
} as const

export const MEASUREMENT_UNIT_KINDS = {
  Money: "money",
  Crypto: "crypto",
  Quota: "quota",
  Count: "count",
  Percent: "percent",
  Unknown: "unknown",
} as const

export const AWARD_TARGETS = {
  Wallet: "wallet",
  Entitlement: "entitlement",
  Unknown: "unknown",
} as const

export const AWARD_FULFILLMENT = {
  Credited: "credited",
  PendingRedemption: "pending-redemption",
  Redeemed: "redeemed",
  Unknown: "unknown",
} as const

export const OBSERVATION_STATUSES = {
  Known: "known",
  Stale: "stale",
  Unknown: "unknown",
  Unsupported: "unsupported",
  Unavailable: "unavailable",
} as const

/** Shared refresh diagnostics remain readable across stored observations and UI details. */
export const FINANCIAL_OBSERVATION_REASONS = {
  LegacySemantics: "legacy-semantics",
  LegacySuperseded: "legacy-superseded-details",
  NotRequested: "not-requested",
  IncompleteEnumeration: "incomplete-enumeration",
  RefreshUnavailable: "refresh-unavailable",
  RefreshFailed: "refresh-failed",
  IdentityChanged: "account-identity-changed",
} as const

export const EVIDENCE_KINDS = {
  Reported: "reported",
  Derived: "derived",
  Manual: "manual",
  Legacy: "legacy",
} as const

export const FINANCIAL_COVERAGE = {
  Complete: "complete",
  Partial: "partial",
  Unknown: "unknown",
} as const

export const SCOPE_SELECTION_KINDS = {
  All: "all",
  Restricted: "restricted",
  Unknown: "unknown",
} as const

export const FINANCIAL_SUBJECT_KINDS = {
  Account: "account",
  Credential: "credential",
} as const

export const BALANCE_ROLES = {
  Ledger: "ledger",
  Available: "available",
  Reserved: "reserved",
  CreditLimit: "credit-limit",
  Debt: "debt",
  PendingCharge: "pending-charge",
  Allowance: "allowance",
} as const

/** Fixed wallet collection identity used when accepting balance refresh parts. */
export const WALLET_BALANCE_COLLECTION_KEY = "wallet"

export const BALANCE_NATURES = {
  Prepaid: "prepaid",
  Subscription: "subscription",
  Credit: "credit",
  Mixed: "mixed",
  Unknown: "unknown",
} as const

export const BALANCE_FUNDING = {
  Purchased: "purchased",
  Granted: "granted",
  Mixed: "mixed",
  Unknown: "unknown",
} as const

export const BALANCE_CASH_CLASSIFICATIONS = {
  ReportedCash: "reported-cash",
  NotCash: "not-cash",
  Unknown: "unknown",
} as const

export const BALANCE_INSTRUMENTS = {
  Voucher: "voucher",
  Unknown: "unknown",
} as const

export const BALANCE_RELATIONS = {
  Component: "component",
  Allocation: "allocation",
  Constraint: "constraint",
  Summary: "summary",
} as const

/** Native balance categories with shared translated display names. */
export const BALANCE_LABEL_KEYS = {
  Normal: "normalBalance",
  Charity: "charityBalance",
  Basic: "basicBalance",
  Bound: "boundBalance",
  Permanent: "permanentBalance",
  Timed: "timedBalance",
  Daily: "dailyBalance",
  TotalTokens: "totalTokens",
  PoolTokens: "poolTokens",
  AllocatedTokens: "allocatedTokens",
} as const

export const BALANCE_VALIDITY_KINDS = {
  NoExpiry: "no-expiry",
  Expires: "expires",
  Unknown: "unknown",
} as const

export const FINANCIAL_ENUMERATION = {
  Complete: "complete",
  Partial: "partial",
  Unavailable: "unavailable",
  NotRequested: "not-requested",
} as const

export const BUDGET_LIMIT_STATES = {
  Finite: "finite",
  Unlimited: "unlimited",
  Inherited: "inherited",
  Unconfigured: "unconfigured",
  Unknown: "unknown",
} as const

export const BUDGET_ENFORCEMENT = {
  Hard: "hard",
  Advisory: "advisory",
  Unknown: "unknown",
} as const

export const BUDGET_WINDOW_KINDS = {
  Lifetime: "lifetime",
  Periodic: "periodic",
  Rolling: "rolling",
  Unknown: "unknown",
} as const

export const BUDGET_PERIODS = {
  FiveHours: "5h",
  Day: "day",
  Week: "week",
  Month: "month",
  Year: "year",
} as const

export const BUDGET_AMOUNT_FIELDS = {
  Limit: "limit",
  Used: "used",
  Remaining: "remaining",
  Reserved: "reserved",
  ByokUsed: "byokUsed",
} as const

/** Fields whose value and observation clock survive a failed budget refresh. */
export const BUDGET_OBSERVATION_FIELDS = [
  ...Object.values(BUDGET_AMOUNT_FIELDS),
  "enabled",
  "includesByok",
  "usedIncludesByok",
] as const

export const INCOME_CLASSIFICATIONS = {
  Topup: "topup",
  Grant: "grant",
  Unclassified: "unclassified",
} as const

export const FINANCIAL_SETTLEMENT_STATUSES = {
  Settled: "settled",
  Pending: "pending",
  Unknown: "unknown",
} as const
