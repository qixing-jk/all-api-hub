import { setupRedemptionAssistContent } from "~/entrypoints/content/redemptionAssist"

import { setupContentMessageHandlers } from "./contentMessages"

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    main()
  }
})

function main() {
  console.log("Hello content script!", { id: browser.runtime.id })

  setupContentMessageHandlers()
  setupRedemptionAssistContent()
}
