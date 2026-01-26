import { RuntimeActionIds } from "~/constants/runtimeActions"
import { showShieldBypassPromptToast } from "~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts"

type ShieldBypassUiMessage = {
  action: typeof RuntimeActionIds.ContentShowShieldBypassUi
  origin?: string
  requestId?: string
}

/**
 * Shows a small on-page prompt indicating this is the shield/protection bypass flow.
 * This is used for temporary tabs/windows opened by the background to pass
 * Cloudflare-like protection pages and obtain cookies/session.
 */
export async function handleShowShieldBypassUi(
  _request: ShieldBypassUiMessage,
  sendResponse: (res: any) => void,
) {
  try {
    await showShieldBypassPromptToast()
    sendResponse({ success: true })
  } catch (error) {
    sendResponse({ success: false, error: (error as Error)?.message })
  }

  return true
}
