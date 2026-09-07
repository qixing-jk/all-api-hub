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

/** Checks the current account binding without reading other saved accounts. */
export function getExistingAccountAccessToken(
  url: string,
  detected: DetectedAccountIdentity,
  existingAccount?: AccountAutoDetectExistingAccount,
): string | undefined {
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
  return existingAccount?.accessToken.trim() || undefined
}

/** Reads matching saved credentials only when the current credential needs recovery. */
export async function findSavedAccountAccessTokens(
  url: string,
  detected: DetectedAccountIdentity,
): Promise<string[]> {
  if (
    getSiteTypeCapabilities(detected.siteType).family !==
    ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
  ) {
    return []
  }
  const scope = getCredentialScope(url)
  if (!scope) return []
  // A failed read is not proof that there are no saved credentials to preserve.
  const accounts = await accountQueries.getAllAccountsOrThrow()
  return accounts
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
}
