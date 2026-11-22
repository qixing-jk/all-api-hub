export const DAHL_ACCOUNT_ENDPOINT = "/v1/account"
export const DAHL_KEYS_ENDPOINT = `${DAHL_ACCOUNT_ENDPOINT}/keys`
export const DAHL_USAGE_ENDPOINT = `${DAHL_ACCOUNT_ENDPOINT}/usage?days=30`
export const DAHL_MODELS_ENDPOINT = "/v1/models"
export const DAHL_WEBSITE_NAMES_KEY = "dahl_key_labels"
export const DAHL_KEY_NAME_MAX_LENGTH = 128

/** Credits settle in native Tokens; purchase quotes do not define cash balance. */
export const DAHL_TOKEN_ASSET = {
  id: "dahl:tokens",
  label: "Token",
  displayScale: 1000000,
  displayLabel: "M Token",
} as const

export const DAHL_KEY_STATUSES = {
  Active: "active",
  Exhausted: "exhausted",
  Revoked: "revoked",
} as const

export const DAHL_TRANSFER_DIRECTIONS = {
  Allocate: "allocate",
  Return: "return",
} as const
export type DahlTransferDirection =
  (typeof DAHL_TRANSFER_DIRECTIONS)[keyof typeof DAHL_TRANSFER_DIRECTIONS]
