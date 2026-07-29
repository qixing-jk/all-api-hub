import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"

import { setupOpenRouterClerkSessionBridge } from "~/entrypoints/content/messageHandlers/openrouter/clerkSessionProtocol"

export default defineUnlistedScript(() => {
  setupOpenRouterClerkSessionBridge()
})
