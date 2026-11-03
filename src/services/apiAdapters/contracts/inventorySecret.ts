/** How plaintext can be recovered after creation; website verification is outside the management API. */
export const INVENTORY_SECRET_AVAILABILITIES = {
  Recoverable: "recoverable",
  CreateResponseOnly: "create-response-only",
  WebsiteVerification: "website-verification",
  Unavailable: "unavailable",
} as const

export type InventorySecretAvailability =
  (typeof INVENTORY_SECRET_AVAILABILITIES)[keyof typeof INVENTORY_SECRET_AVAILABILITIES]

export const getInventorySecretAvailability = (capability: {
  inventorySecretAvailability?: InventorySecretAvailability
}): InventorySecretAvailability =>
  capability.inventorySecretAvailability ??
  INVENTORY_SECRET_AVAILABILITIES.Recoverable
