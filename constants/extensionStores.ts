import type { ExtensionStoreId } from "~/utils/browser"

export const EXTENSION_STORE_LISTING_URLS: Record<ExtensionStoreId, string> = {
  chrome:
    "https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo",
  edge: "https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa",
  firefox:
    "https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}",
}
