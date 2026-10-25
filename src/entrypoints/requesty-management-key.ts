import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"

import { setupRequestyManagementKeyBridge } from "~/entrypoints/content/messageHandlers/requesty/managementKeyBridge"

export default defineUnlistedScript(() => {
  setupRequestyManagementKeyBridge()
})
