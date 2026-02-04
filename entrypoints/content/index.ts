import { defineContentScript } from "wxt/utils/define-content-script"

import { setupRedemptionAssistContent } from "~/entrypoints/content/redemptionAssist"
import { setupWebAiApiCheckContent } from "~/entrypoints/content/webAiApiCheck"
import { createLogger } from "~/utils/logger"

import { setupContentMessageHandlers } from "./messageHandlers"
import { setContentScriptContext } from "./shared/uiRoot"

/**
 * Unified logger scoped to the content-script entrypoint.
 */
const logger = createLogger("ContentEntrypoint")

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
  logger.debug("Hello content script", { id: browser.runtime.id })

  setupContentMessageHandlers()
  setupRedemptionAssistContent()
  setupWebAiApiCheckContent()
}
