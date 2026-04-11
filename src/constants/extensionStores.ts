import type { ExtensionStoreId } from "~/utils/browser"

// Firefox is intentionally excluded here because its add-on/runtime ID scheme
// differs from Chromium-family extension IDs and cannot be matched reliably
// through the same runtime-id mapping used for Chrome/Edge store builds.
// In practice we also do not maintain a separate Firefox release-store runtime
// ID mapping here because AMO review is typically fast enough that very few
// users would need a distinct "release" channel lookup from this table.
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
