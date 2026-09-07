import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { sendTabMessageWithRetry } from "~/utils/browser/browserApi"

/** Returns only an identity that the active top-level page verified with its server. */
export async function readAccountBrowserIdentityFromTab(input: {
  tabId: number
  baseUrl: string
  siteType: AccountSiteType
  candidateUserIds: readonly string[]
}): Promise<string | null> {
  try {
    const response = await sendTabMessageWithRetry(
      input.tabId,
      {
        action: RuntimeActionIds.ContentGetUserFromLocalStorage,
        url: input.baseUrl,
        siteType: input.siteType,
        verifyIdentity: true,
        candidateUserIds: input.candidateUserIds,
      },
      // A loading or missing content script is an inconclusive passive check.
      // The next page event can try again; do not keep retrying in the popup.
      { frameId: 0, maxAttempts: 1 },
    )
    if (!response?.success || response.data?.identityVerified !== true)
      return null
    return normalizeAccountIdentity(response.data.userId)
  } catch {
    return null
  }
}
