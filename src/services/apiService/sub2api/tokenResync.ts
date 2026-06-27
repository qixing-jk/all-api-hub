import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"

type Sub2ApiResyncedToken = {
  accessToken: string
  source:
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
}

const hasUsableAccessToken = (session: AccountBrowserSession): boolean =>
  typeof session.accessToken === "string" &&
  session.accessToken.trim().length > 0

const mapResyncSource = (
  source: AccountBrowserSession["source"],
): Sub2ApiResyncedToken["source"] => {
  switch (source) {
    case ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB:
    case ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB:
      return ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    case ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW:
      return ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
    default: {
      const exhaustive: never = source
      return exhaustive
    }
  }
}

/**
 * Re-sync Sub2API JWT from browser-session state.
 *
 * Strategy:
 * 1) Prefer an already-open same-origin tab through the browser-session reader.
 * 2) Fall back to the temp-window auto-detect context.
 */
export async function resyncSub2ApiAuthToken(
  baseUrl: string,
): Promise<Sub2ApiResyncedToken | null> {
  const session = await resolveAccountBrowserSession({
    baseUrl,
    siteType: SITE_TYPES.SUB2API,
    useExistingTabs: true,
    useTempWindow: true,
    requestIdPrefix: "sub2api-token-resync",
    isUsableSession: hasUsableAccessToken,
  })

  const accessToken = session?.accessToken?.trim()
  if (!session || !accessToken) return null

  return {
    accessToken,
    source: mapResyncSource(session.source),
  }
}
