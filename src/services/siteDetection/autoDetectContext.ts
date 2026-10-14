import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"

import type {
  AutoDetectFetchContext,
  CurrentTabAutoDetectRequest,
} from "./autoDetectContracts"

/** Builds the tab execution context, omitting regular-profile and empty-container hints. */
export function createCurrentTabAutoDetectContext({
  url,
  tabId,
  incognito,
  cookieStoreId,
}: CurrentTabAutoDetectRequest): Extract<
  AutoDetectFetchContext,
  { kind: typeof API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB }
> {
  return {
    kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
    tabId,
    origin: new URL(url).origin,
    ...(incognito === true ? { incognito: true } : {}),
    ...(cookieStoreId ? { cookieStoreId } : {}),
  }
}
