/** Native editor identities shared by descriptors and their presentation policy. */
export const PMAPI_KEY_EDITOR_FIELDS = {
  Name: "name",
  Group: "grp",
  Unlimited: "unlimited",
  Quota: "quotaUsd",
  ExpiresAt: "expiresAt",
  Models: "models",
  Subnet: "subnet",
  Rpm: "rpm",
} as const

/** Inventory fact identities for restrictions and budgets. */
export const PMAPI_KEY_FACT_FIELDS = {
  Group: "grp",
  Models: "models",
  Subnet: "subnet",
  Rpm: "rpm",
} as const
