import { defineContentScript } from "wxt/utils/define-content-script"

import { setupRedemptionAssistContent } from "~/entrypoints/content/redemptionAssist"

import { setupContentMessageHandlers } from "./messageHandlers"
import { setContentScriptContext } from "./redemptionAssist/uiRoot"

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  async main(ctx) {
    setContentScriptContext(ctx)
    mainLogic()
  },
})

/**
 * Bootstraps content-script side features: sanitizeUrlForLog, message handlers, and redemption assist UI.
 */
function mainLogic() {
  console.log("Hello content script!", { id: browser.runtime.id })

  setupContentMessageHandlers()
  setupRedemptionAssistContent()
}
