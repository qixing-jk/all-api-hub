import type { LoginVerificationReason } from "~/constants/browserLogin"

export interface VerificationContext {
  tabId: number
  ownerWindowId?: number
  reason?: LoginVerificationReason
  onOpened?: () => void
}
let clearNotice: ((requestId: string) => void) | undefined
/** Removes reminder UI when its login operation releases the context. */
export function setLoginVerificationNoticeCleanup(
  cleanup: (requestId: string) => void,
) {
  clearNotice = cleanup
}
let presentNotice:
  | ((requestId: string) => Promise<{ presented: boolean }>)
  | undefined
/** Connects login-owned contexts to the background's existing reminder delivery. */
export function setLoginVerificationPresenter(
  present: NonNullable<typeof presentNotice>,
) {
  presentNotice = present
}
/** Requests the user's configured reminder channels without focusing their window. */
export async function requestLoginVerificationAssist(requestId: string) {
  return (await presentNotice?.(requestId))?.presented === true
}
const contexts = new Map<string, VerificationContext>()
/** Registers only the live browser window owned by this login operation. */
export function registerLoginVerificationContext(
  requestId: string,
  context: VerificationContext,
) {
  contexts.set(requestId, context)
  return () => {
    if (contexts.get(requestId) === context) {
      contexts.delete(requestId)
      clearNotice?.(requestId)
    }
  }
}
export const getLoginVerificationContext = (requestId: string) =>
  contexts.get(requestId)
export const hasLoginVerificationTab = (tabId: number) =>
  [...contexts.values()].some((context) => context.tabId === tabId)
