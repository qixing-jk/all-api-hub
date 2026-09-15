/** Whether an inventory resource can reveal plaintext after creation. */
export const INVENTORY_SECRET_AVAILABILITIES = {
  Recoverable: "recoverable",
  CreateResponseOnly: "create-response-only",
  Unavailable: "unavailable",
} as const

export type InventorySecretAvailability =
  (typeof INVENTORY_SECRET_AVAILABILITIES)[keyof typeof INVENTORY_SECRET_AVAILABILITIES]

export const getInventorySecretAvailability = (capability: {
  inventorySecretAvailability?: InventorySecretAvailability
}): InventorySecretAvailability =>
  capability.inventorySecretAvailability ??
  INVENTORY_SECRET_AVAILABILITIES.Recoverable
