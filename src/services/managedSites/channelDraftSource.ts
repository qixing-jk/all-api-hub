import {
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { normalizeAccountSiteProfileUrlForManagedChannel } from "~/services/accounts/accountSiteProfile/urls"
import type { ManagedSiteChannelDraftSource } from "~/types/managedSiteChannelDraft"
import { parseDelimitedList } from "~/utils/core/string"

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
    baseUrl: normalizeAccountSiteProfileUrlForManagedChannel({
      siteType: runtimeKey.siteType,
      url: runtimeKey.baseUrl.trim() || runtimeKey.account.baseUrl,
    }),
    apiKey: runtimeKey.secret,
    modelHints: isAccountTokenRuntimeKey(runtimeKey)
      ? parseDelimitedList(runtimeKey.token.models)
      : [],
  }
}

/** Preserves the explicit endpoint of a raw credential without account policies. */
export function buildManagedSiteCredentialDraftSource(
  credentials: Pick<
    ManagedSiteChannelDraftSource,
    "name" | "baseUrl" | "apiKey"
  >,
): ManagedSiteChannelDraftSource {
  return {
    name: buildDraftName(credentials.name, credentials.name),
    baseUrl: credentials.baseUrl.trim(),
    apiKey: credentials.apiKey,
    modelHints: [],
  }
}
