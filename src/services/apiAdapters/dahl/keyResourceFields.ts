/** Stable editor projection IDs shared by the adapter and its presentation. */
export const DAHL_KEY_RESOURCE_FIELDS = {
  Name: "local_name",
  NameSync: "name_sync",
  TransferDirection: "transfer_direction",
  TransferAmount: "transfer_amount",
  PoolTokens: "pool_tokens",
  KeyTokens: "key_tokens",
  KeyMask: "key_mask",
} as const

export const DAHL_KEY_NAME_SYNC_STATES = {
  Pending: "pending",
  Synced: "synced",
  Cached: "cached",
} as const
export type DahlKeyNameSyncState =
  (typeof DAHL_KEY_NAME_SYNC_STATES)[keyof typeof DAHL_KEY_NAME_SYNC_STATES]
