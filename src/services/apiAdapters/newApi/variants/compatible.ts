import { compatibleTokenInventoryOverrides } from "../variantOperations/key"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const compatibleVariant: NewApiVariantRegistration = {
  key: { transport: compatibleTokenInventoryOverrides },
}
