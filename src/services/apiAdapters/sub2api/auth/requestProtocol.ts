import type { RequestProtocol } from "~/services/apiAdapters/requestProtocol"
import { fetchSub2ApiBrowserPanelRequest } from "~/services/apiService/sub2api/auth/browserPanelProof"
import { fetchSub2ApiPanelRequest } from "~/services/apiService/sub2api/auth/panelProof"
import { hasSub2ApiPanelBinding } from "~/services/apiService/sub2api/auth/panelProofCapability"

/** Signing and page-context policy share the same confirmed deployment evidence. */
export const sub2ApiRequestProtocol: RequestProtocol = {
  requiresExtensionContext: hasSub2ApiPanelBinding,
  fetch: fetchSub2ApiPanelRequest,
  fetchInBrowser: fetchSub2ApiBrowserPanelRequest,
}
