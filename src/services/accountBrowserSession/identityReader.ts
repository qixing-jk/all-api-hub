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
      { frameId: 0 },
    )
    if (!response?.success || response.data?.identityVerified !== true)
      return null
    return normalizeAccountIdentity(response.data.userId)
  } catch {
    return null
  }
}
