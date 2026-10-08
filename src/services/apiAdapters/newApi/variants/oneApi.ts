import {
  createNewApiKeyGroupBehavior,
  NEW_API_KEY_GROUP_MODES,
} from "~/services/apiAdapters/newApi/keys/keyGroupBehavior"

import { oneApiTokenInventoryOverrides } from "../variantOperations/key"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const oneApiVariant: NewApiVariantRegistration = {
  key: {
    transport: oneApiTokenInventoryOverrides,
    group: createNewApiKeyGroupBehavior(NEW_API_KEY_GROUP_MODES.None),
  },
}
