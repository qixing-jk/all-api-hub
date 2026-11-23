import type { AccountSiteType } from "~/constants/siteType"
import { getCompatibleAccountVariant } from "~/services/apiAdapters/compatibleAccountVariant"
import {
  createNewApiKeyVariant,
  type NewApiKeyVariant,
} from "~/services/apiAdapters/newApi/variantOperations/key"

export type {
  NewApiFamilyTokenTransport,
  NewApiKeyVariant,
} from "~/services/apiAdapters/newApi/variantOperations/key"
/** Binds all account-key behavior before shared orchestration runs. */
export function resolveNewApiKeyVariant(
  siteType?: AccountSiteType,
): NewApiKeyVariant {
  return createNewApiKeyVariant(getCompatibleAccountVariant(siteType).key)
}
