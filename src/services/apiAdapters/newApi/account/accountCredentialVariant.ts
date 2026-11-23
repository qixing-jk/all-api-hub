import type { AccountSiteType } from "~/constants/siteType"
import { getCompatibleAccountVariant } from "~/services/apiAdapters/compatibleAccountVariant"
import { createNewApiAccountCredentialVariant } from "~/services/apiAdapters/newApi/variantOperations/credentials"

export { createSafeCredentialError } from "~/services/apiAdapters/newApi/variantOperations/credentials"
/** Shares credential acquisition, normalization and recovery for the selected site. */
export function resolveNewApiAccountCredentialVariant(
  siteType: AccountSiteType,
) {
  return createNewApiAccountCredentialVariant(
    getCompatibleAccountVariant(siteType).credentials,
  )
}
