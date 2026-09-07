import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  type AccountSiteType,
} from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  AutoDetectCompletionError,
  type DetectedAccountIdentity,
} from "~/services/accounts/autoDetectCompletion/types"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

export interface AccountAutoDetectExistingAccount {
  url: string
  siteType: AccountSiteType
  userId: string
  accessToken: string
}

/** Keeps credential reuse bound to the API origin and deployment path. */
function getCredentialScope(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`
  } catch {
    return null
  }
}

/** Finds saved management credentials before account detection can rotate one. */
export async function findExistingAccountAccessTokens(
  url: string,
  detected: DetectedAccountIdentity,
  existingAccount?: AccountAutoDetectExistingAccount,
): Promise<string[]> {
  const scope = getCredentialScope(url)
  if (
    existingAccount &&
    (!scope ||
      getCredentialScope(existingAccount.url) !== scope ||
      normalizeAccountIdentity(existingAccount.userId) !==
        normalizeAccountIdentity(detected.userId))
  ) {
    throw new AutoDetectCompletionError(
      AUTO_DETECT_FAILURE_REASONS.AccountIdentityMismatch,
      new Error("The detected account does not match the existing account"),
    )
  }
  if (
    getSiteTypeCapabilities(detected.siteType).family !==
    ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
  ) {
    return []
  }
  if (!scope) return []
  // A failed read is not proof that there are no saved credentials to preserve.
  const accounts = await accountQueries.getAllAccountsOrThrow()
  const savedTokens = accounts
    .filter(
      (account) =>
        getSiteTypeCapabilities(account.site_type).family ===
          ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily &&
        getCredentialScope(account.site_url) === scope &&
        normalizeAccountIdentity(account.account_info.id) ===
          normalizeAccountIdentity(detected.userId),
    )
    .map((account) => account.account_info.access_token.trim())
    .filter(Boolean)
  if (existingAccount) {
    return [existingAccount.accessToken.trim(), ...savedTokens].filter(Boolean)
  }
  return savedTokens
}
