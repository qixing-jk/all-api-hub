import {
  findAccessTokenCueTarget,
  isCredentialPageAction,
  isLegacyCredentialRouteMissing,
  SECURITY_ACCESS_SECTION_SELECTOR,
} from "~/services/browsingContext/newApiAccessTokenPage/targets"
import {
  CREDENTIAL_PAGE_STATES,
  type CredentialPageState,
} from "~/services/protectionBypass/contracts"

const WAIT_FOR_CREDENTIAL_PAGE_MS = 5000

/** Read-only capability check. Never clicks token controls or reads their values. */
export async function handleInspectCredentialPage(
  _request: unknown,
  sendResponse: (value: unknown) => void,
) {
  const inspect = (): CredentialPageState => {
    if (
      document.querySelector(SECURITY_ACCESS_SECTION_SELECTOR) ||
      findAccessTokenCueTarget()
    )
      return CREDENTIAL_PAGE_STATES.Credential
    const buttons = [...document.querySelectorAll("button")]
    if (buttons.some(isCredentialPageAction))
      return CREDENTIAL_PAGE_STATES.Credential
    if (
      isLegacyCredentialRouteMissing() ||
      [...document.querySelectorAll("h1")].some(
        (node) => node.textContent?.trim() === "404",
      )
    )
      return CREDENTIAL_PAGE_STATES.NotFound
    return CREDENTIAL_PAGE_STATES.Unknown
  }
  let state = inspect()
  if (state === CREDENTIAL_PAGE_STATES.Unknown) {
    state = await new Promise<CredentialPageState>((resolve) => {
      const observer = new MutationObserver(() => {
        const next = inspect()
        if (next !== CREDENTIAL_PAGE_STATES.Unknown) {
          observer.disconnect()
          clearTimeout(timer)
          resolve(next)
        }
      })
      const timer = setTimeout(() => {
        observer.disconnect()
        resolve(CREDENTIAL_PAGE_STATES.Unknown)
      }, WAIT_FOR_CREDENTIAL_PAGE_MS)
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
    })
  }
  sendResponse({ success: true, state })
}
