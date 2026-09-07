import type { ApiToken, DisplaySiteData } from "~/types"

/** Builds the shared default name for an imported account credential. */
export function buildManagedSiteChannelName(
  account: Pick<DisplaySiteData, "name">,
  token: Pick<ApiToken, "name">,
): string {
  const name = `${account.name} | ${token.name}`.trim()
  return name.endsWith("(auto)") ? name : `${name} (auto)`
}
