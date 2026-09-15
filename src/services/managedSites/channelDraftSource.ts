import {
  isAccountKeyResourceRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { normalizeAccountSiteProfileUrlForManagedChannel } from "~/services/accounts/accountSiteProfile/urls"
import type { ManagedSiteChannelDraftSource } from "~/types/managedSiteChannelDraft"

/** Keeps the existing account/key name and automatic-import suffix. */
const buildDraftName = (sourceName: string, keyName: string): string => {
  const name = `${sourceName} | ${keyName}`.trim()
  return name.endsWith("(auto)") ? name : `${name} (auto)`
}

/** Projects a selected runtime key into the values needed by a destination. */
export function buildManagedSiteChannelDraftSource(
  runtimeKey: AccountRuntimeKey,
): ManagedSiteChannelDraftSource {
  return {
    name: buildDraftName(runtimeKey.accountName, runtimeKey.label),
    baseUrl:
      isAccountKeyResourceRuntimeKey(runtimeKey) &&
      runtimeKey.baseUrl.trim() === runtimeKey.account.baseUrl.trim()
        ? normalizeAccountSiteProfileUrlForManagedChannel({
            siteType: runtimeKey.siteType,
            url: runtimeKey.baseUrl.trim(),
          })
        : runtimeKey.baseUrl.trim() || runtimeKey.account.baseUrl,
    apiKey: runtimeKey.secret,
    modelHints: [...runtimeKey.modelAccess.suggestedModelIds],
  }
}

/** Preserves the explicit endpoint of a raw credential without account policies. */
export function buildManagedSiteCredentialDraftSource(
  credentials: Pick<
    ManagedSiteChannelDraftSource,
    "name" | "baseUrl" | "apiKey" | "apiType"
  >,
): ManagedSiteChannelDraftSource {
  return {
    name: buildDraftName(credentials.name, credentials.name),
    baseUrl: credentials.baseUrl.trim(),
    apiKey: credentials.apiKey,
    ...(credentials.apiType ? { apiType: credentials.apiType } : {}),
    modelHints: [],
  }
}
