import type { AccountSiteType } from "~/constants/siteType"
import {
  createNewApiKeyVariant,
  type NewApiKeyVariant,
} from "~/services/apiAdapters/newApi/variantOperations/key"
import { getNewApiVariantRegistration } from "~/services/apiAdapters/newApi/variantRegistration"

export type {
  NewApiFamilyTokenTransport,
  NewApiKeyVariant,
} from "~/services/apiAdapters/newApi/variantOperations/key"
/** Binds all account-key behavior before shared orchestration runs. */
export function resolveNewApiKeyVariant(
  siteType?: AccountSiteType,
): NewApiKeyVariant {
  return createNewApiKeyVariant(getNewApiVariantRegistration(siteType).key)
}
