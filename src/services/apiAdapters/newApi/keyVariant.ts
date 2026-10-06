import type { AccountSiteType } from "~/constants/siteType"

import {
  createNewApiKeyVariant,
  type NewApiKeyVariant,
} from "./variantOperations/key"
import { getNewApiVariantRegistration } from "./variantRegistration"

export type {
  NewApiFamilyTokenTransport,
  NewApiKeyVariant,
} from "./variantOperations/key"
/** Binds all account-key behavior before shared orchestration runs. */
export function resolveNewApiKeyVariant(
  siteType?: AccountSiteType,
): NewApiKeyVariant {
  return createNewApiKeyVariant(getNewApiVariantRegistration(siteType).key)
}
