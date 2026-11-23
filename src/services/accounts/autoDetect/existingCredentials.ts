import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  type AccountSiteType,
} from "~/constants/siteType"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  AutoDetectCompletionError,
  type DetectedAccountIdentity,
} from "~/services/accounts/autoDetectCompletion/types"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import {
  getAccountSiteDefinition,
  isCompatibleAccountFamily,
} from "~/services/accountSiteDefinitions"
import type { NovitaCredentialMode } from "~/services/apiService/novita/constants"

export interface AccountAutoDetectExistingAccount {
  url: string
  siteType: AccountSiteType
  userId: string
  accessToken: string
  aimlApiKey?: string
  novitaCredentialMode?: NovitaCredentialMode
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

/** Shell sites share a protocol while keeping their credential sources separate. */
function hasCompatibleCredentialSource(
  saved: AccountSiteType,
  detected: AccountSiteType,
): boolean {
  const family = getAccountSiteDefinition(detected)?.adapterFamily
  return family === ACCOUNT_SITE_ADAPTER_FAMILIES.ShellApiFamily
    ? saved === detected
    : getAccountSiteDefinition(saved)?.adapterFamily === family
}

/** Checks deployment, identity, and protocol bindings without reading storage. */
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
        normalizeAccountIdentity(detected.userId) ||
      !hasCompatibleCredentialSource(
        existingAccount.siteType,
        detected.siteType,
      ))
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
  const family = getAccountSiteDefinition(detected.siteType)?.adapterFamily
  if (!isCompatibleAccountFamily(family)) {
    return []
  }
  const scope = getCredentialScope(url)
  if (!scope) return []
  // A failed read is not proof that there are no saved credentials to preserve.
  const accounts = await accountQueries.getAllAccountsOrThrow()
  return accounts
    .filter(
      (account) =>
        hasCompatibleCredentialSource(account.site_type, detected.siteType) &&
        getCredentialScope(account.site_url) === scope &&
        normalizeAccountIdentity(account.account_info.id) ===
          normalizeAccountIdentity(detected.userId),
    )
    .map((account) => account.account_info.access_token.trim())
    .filter(Boolean)
}
