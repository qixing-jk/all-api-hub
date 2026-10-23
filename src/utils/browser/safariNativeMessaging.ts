import { browser } from "wxt/browser"

/** Safari routes native messages to this extension's own containing app. */
export function getSafariNativeMessagingApi() {
  return {
    runtime: browser.runtime,
    permissions: browser.permissions,
    cookies: browser.cookies,
  }
}
