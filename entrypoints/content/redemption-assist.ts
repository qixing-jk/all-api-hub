/**
 * Redemption Assist Content Script
 * Detects redemption codes on custom check-in pages and shows in-page toast prompts
 */

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    initRedemptionAssist()
  }
})

function initRedemptionAssist() {
  console.log("[RedemptionAssist] Content script initialized")

  // TODO: Implement code detection and toast UI
  // This will be implemented after we set up the background service
}
