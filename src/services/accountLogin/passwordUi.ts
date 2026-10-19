import {
  BROWSER_LOGIN_SESSION_MODES,
  BROWSER_LOGIN_STATUS,
} from "~/constants/browserLogin"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  validatePasswordLoginContext,
  validatePasswordLoginRequest,
} from "~/services/accountLogin/passwordContent"
import { BrowserOAuthRequestError } from "~/services/browserOAuth/contentRequest"
import {
  hasPageVerification,
  waitForPageVerification,
} from "~/services/checkin/pageVerification"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"

import {
  acceptLoginAgreement,
  fillPasswordInput,
  findPasswordLoginForm,
  isVisiblePasswordControl,
} from "./passwordForm"
import {
  PASSWORD_UI_KINDS,
  PASSWORD_UI_PHASES,
  PASSWORD_UI_REASONS,
  type PasswordUiReply,
  type PasswordUiRequest,
} from "./passwordUiProtocol"

export { enterPasswordLogin } from "./passwordForm"

export type { PasswordUiReply, PasswordUiRequest } from "./passwordUiProtocol"

export type PasswordUiSession = { identity: string; checkedIn?: boolean }
export interface PasswordUiProvider {
  readSession(): Promise<PasswordUiSession | null>
  logout(): Promise<void>
  settings(): Promise<{ enabled: boolean; verification: boolean }>
  enterPasswordLogin?(): boolean
}
type PasswordUiFlow = {
  requestId?: unknown
  expectedIdentity?: unknown
  submitted?: unknown
}
const FORM_WAIT_MS = 3_000
const PASSWORD_CHOICE_WAIT_MS = 8_000
const FORM_POLL_INTERVAL_MS = 250
const FLOW_KEY = "all-api-hub:password-ui"

/** Native submission owns encryption, captcha tokens and any second factor. */
export function handlePasswordUi(
  request: PasswordUiRequest,
  reply: (result: PasswordUiReply) => void,
  provider: PasswordUiProvider,
): true {
  void (async (): Promise<PasswordUiReply> => {
    const requestId = validatePasswordLoginContext(request)
    const expectedIdentity =
      typeof request.expectedIdentity === "string"
        ? request.expectedIdentity.trim()
        : ""
    if (!expectedIdentity) throw new Error("Invalid identity")
    if (request.phase === PASSWORD_UI_PHASES.Prepare) {
      const current = await provider.readSession()
      if (current) {
        if (
          current.identity === expectedIdentity &&
          request.sessionMode !== BROWSER_LOGIN_SESSION_MODES.Fresh
        )
          return {
            status: BROWSER_LOGIN_STATUS.Authenticated,
            identity: current.identity,
          }
        if (request.canResetSession !== true)
          return {
            kind: PASSWORD_UI_KINDS.Manual,
            reason: PASSWORD_UI_REASONS.Session,
          }
        await provider.logout()
        if (await provider.readSession())
          return { status: BROWSER_LOGIN_STATUS.Uncertain }
        return { kind: PASSWORD_UI_KINDS.Reload }
      }
      const settings = await provider.settings()
      if (!settings.enabled) return { status: BROWSER_LOGIN_STATUS.Unsupported }
      sessionStorage.setItem(
        FLOW_KEY,
        JSON.stringify({ requestId, expectedIdentity, submitted: false }),
      )
      let fields = findPasswordLoginForm()
      let enteredPasswordLogin = false
      let deadline = Date.now() + FORM_WAIT_MS
      while (!fields && Date.now() < deadline) {
        if (!enteredPasswordLogin && provider.enterPasswordLogin?.()) {
          enteredPasswordLogin = true
          deadline = Date.now() + PASSWORD_CHOICE_WAIT_MS
          fields = findPasswordLoginForm()
          if (fields) break
        }
        await new Promise((resolve) =>
          setTimeout(resolve, FORM_POLL_INTERVAL_MS),
        )
        fields = findPasswordLoginForm()
      }
      return fields
        ? { kind: PASSWORD_UI_KINDS.Ready }
        : {
            kind:
              enteredPasswordLogin ||
              settings.verification ||
              [
                ...document.querySelectorAll<HTMLElement>(
                  "form, button, input:not([type=hidden]), [role=button]",
                ),
              ].some(isVisiblePasswordControl) ||
              hasPageVerification() ||
              [
                ...document.querySelectorAll<HTMLInputElement>(
                  'input[autocomplete="one-time-code"], input[name="otp"], input[name="totp"], input[name="code"]',
                ),
              ].some(isVisiblePasswordControl)
                ? PASSWORD_UI_KINDS.Manual
                : PASSWORD_UI_KINDS.Fallback,
          }
    }
    const flow: PasswordUiFlow | null = JSON.parse(
      sessionStorage.getItem(FLOW_KEY) || "null",
    )
    if (
      flow?.requestId !== requestId ||
      flow?.expectedIdentity !== expectedIdentity
    )
      return { status: BROWSER_LOGIN_STATUS.Failed }
    if (request.phase === PASSWORD_UI_PHASES.Submit) {
      if (flow.submitted) return { status: BROWSER_LOGIN_STATUS.Uncertain }
      let fields = findPasswordLoginForm()
      if (!fields) return { kind: PASSWORD_UI_KINDS.Manual }
      const { credentials } = validatePasswordLoginRequest(request)
      if (!(await acceptLoginAgreement(fields.form)))
        return { kind: PASSWORD_UI_KINDS.Manual }
      fields = findPasswordLoginForm()
      if (!fields) return { kind: PASSWORD_UI_KINDS.Manual }
      fillPasswordInput(fields.identity, credentials.username)
      fillPasswordInput(fields.password, credentials.password)
      const markSubmitted = () =>
        sessionStorage.setItem(
          FLOW_KEY,
          JSON.stringify({ ...flow, submitted: true }),
        )
      fields.form.addEventListener("submit", markSubmitted, {
        once: true,
        capture: true,
      })
      let verification
      try {
        verification = await waitForPageVerification({
          requestId,
          requestAssist: async () => {
            const response = await sendRuntimeMessage({
              action: RuntimeActionIds.TurnstileRequestUserAssist,
              requestId,
            })
            return response?.presented === true
          },
        })
      } finally {
        fields.form.removeEventListener("submit", markSubmitted, true)
      }
      if (JSON.parse(sessionStorage.getItem(FLOW_KEY) || "null")?.submitted)
        return { kind: PASSWORD_UI_KINDS.Submitted }
      if (
        verification.status === "required" ||
        !fields.form.isConnected ||
        fields.identity.disabled ||
        fields.password.disabled ||
        fields.submit.disabled
      )
        return { kind: PASSWORD_UI_KINDS.Manual }
      // Mark before invoking the site: navigation may destroy the response port.
      markSubmitted()
      fields.submit.click()
      return { kind: PASSWORD_UI_KINDS.Submitted }
    }
    if (request.phase === PASSWORD_UI_PHASES.Observe) {
      let current: PasswordUiSession | null
      try {
        current = await provider.readSession()
      } catch (error) {
        if (
          !(error instanceof BrowserOAuthRequestError) ||
          error.reason !== "request_failed"
        )
          throw error
        // Navigation or a transient request failure can interrupt this read.
        // Keep the bounded browser observation loop running without replaying
        // the native login submission or declaring its outcome prematurely.
        return { kind: PASSWORD_UI_KINDS.Pending }
      }
      if (!current) return { kind: PASSWORD_UI_KINDS.Pending }
      if (current.identity !== expectedIdentity)
        return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
      return {
        status: BROWSER_LOGIN_STATUS.Authenticated,
        identity: current.identity,
        ...(typeof current.checkedIn === "boolean"
          ? { evidence: { checkedIn: current.checkedIn } }
          : {}),
      }
    }
    return { status: BROWSER_LOGIN_STATUS.Failed }
  })().then(reply, () => reply({ status: BROWSER_LOGIN_STATUS.Uncertain }))
  return true
}
