import { setupContentMessageHandlers } from "./contentMessages"
import { setupRedemptionAssistContent } from "./redemptionAssistContent"

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
