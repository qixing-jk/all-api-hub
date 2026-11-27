import type { CompatibleAccountVariant } from "../../compatibleAccountVariantContract"
import { compatibleTokenInventoryOverrides } from "../variantOperations/key"

export const compatibleVariant: CompatibleAccountVariant = {
  key: { transport: compatibleTokenInventoryOverrides },
}
