import { fetchSub2ApiPanelProofRequest } from "./panelProofProtocol"
import {
  getSub2ApiPanelSigningKey,
  readSub2ApiPanelSigningKey,
} from "./panelProofStore"

export { readSub2ApiPanelTokenBinding } from "./panelProofProtocol"

/** Background requests use only the extension's origin-scoped signing keys. */
export function fetchSub2ApiPanelRequest(
  url: string,
  options: RequestInit,
  dispatch: (options: RequestInit) => Promise<Response>,
): Promise<Response> {
  return fetchSub2ApiPanelProofRequest(url, options, dispatch, {
    read: readSub2ApiPanelSigningKey,
    get: getSub2ApiPanelSigningKey,
  })
}
