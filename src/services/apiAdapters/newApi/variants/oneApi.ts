import {
  createNewApiKeyGroupBehavior,
  NEW_API_KEY_GROUP_MODES,
} from "~/services/apiAdapters/newApi/keys/keyGroupBehavior"

import type { CompatibleAccountVariant } from "../../compatibleAccountVariantContract"
import { oneApiTokenInventoryOverrides } from "../variantOperations/key"

export const oneApiVariant: CompatibleAccountVariant = {
  key: {
    transport: oneApiTokenInventoryOverrides,
    group: createNewApiKeyGroupBehavior(NEW_API_KEY_GROUP_MODES.None),
  },
}
