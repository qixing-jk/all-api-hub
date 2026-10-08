import type { AccountSiteType } from "~/constants/siteType"
import { createNewApiAccountCredentialVariant } from "~/services/apiAdapters/newApi/variantOperations/credentials"
import { getNewApiVariantRegistration } from "~/services/apiAdapters/newApi/variantRegistration"

export { createSafeCredentialError } from "~/services/apiAdapters/newApi/variantOperations/credentials"
/** Shares credential acquisition, normalization and recovery for the selected site. */
export function resolveNewApiAccountCredentialVariant(
  siteType: AccountSiteType,
) {
  return createNewApiAccountCredentialVariant(
    getNewApiVariantRegistration(siteType).credentials,
  )
}
