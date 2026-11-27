import { defineContentScript } from "wxt/utils/define-content-script"

import { captureTokenOAuthCallback } from "~/services/apiService/newApiFamily/accessTokens/callback"

export default defineContentScript({
  matches: ["*://*/oauth/*"],
  runAt: "document_start",
  main: captureTokenOAuthCallback,
})
