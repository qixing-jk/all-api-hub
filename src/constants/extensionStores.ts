import type { ExtensionStoreId } from "~/utils/browser"

// Legacy Chromium installs can use known runtime IDs for update eligibility.
// Marked builds use their baked distribution channel. Firefox's ID identifies
// the add-on, but does not distinguish AMO packages from self-distributed ones.
export const EXTENSION_STORE_IDS: Record<
  Exclude<ExtensionStoreId, "firefox">,
  string
> = {
  chrome: "lapnciffpekdengooeolaienkeoilfeo",
  edge: "pcokpjaffghgipcgjhapgdpeddlhblaa",
}

export const EXTENSION_STORE_LISTING_URLS: Record<ExtensionStoreId, string> = {
  chrome:
    "https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo",
  edge: "https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa",
  firefox:
    "https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}",
}
