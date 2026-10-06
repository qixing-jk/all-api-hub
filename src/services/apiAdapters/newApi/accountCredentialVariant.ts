import type { AccountSiteType } from "~/constants/siteType"

import { createNewApiAccountCredentialVariant } from "./variantOperations/credentials"
import { getNewApiVariantRegistration } from "./variantRegistration"

export { createSafeCredentialError } from "./variantOperations/credentials"
/** Shares credential acquisition, normalization and recovery for the selected site. */
export function resolveNewApiAccountCredentialVariant(
  siteType: AccountSiteType,
) {
  return createNewApiAccountCredentialVariant(
    getNewApiVariantRegistration(siteType).credentials,
  )
}
